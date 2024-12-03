import { convert } from "libreoffice-convert";
import { fromPath } from "pdf2pic";
import {
  ConvertedNodeType,
  ListItem,
  LLMParams,
  MdNodeType,
  ParentId,
  ProcessedNode,
} from "./types";
import { nanoid } from "nanoid";
import { NUM_STARTING_WORKERS } from "./constants";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import * as Tesseract from "tesseract.js";
import axios from "axios";
import fs from "fs-extra";
import mime from "mime-types";
import path from "path";
import sharp from "sharp";

const convertAsync = promisify(convert);

const defaultLLMParams: LLMParams = {
  frequencyPenalty: 0, // OpenAI defaults to 0
  maxTokens: 2000,
  presencePenalty: 0, // OpenAI defaults to 0
  temperature: 0,
  topP: 1, // OpenAI defaults to 1
};

interface CleanupImageProps {
  correctOrientation: boolean;
  imageBuffer: Buffer;
  scheduler: Tesseract.Scheduler | null;
  trimEdges: boolean;
}

export const getTesseractScheduler = async () => {
  return Tesseract.createScheduler();
};

const createAndAddWorker = async (scheduler: Tesseract.Scheduler) => {
  const worker = await Tesseract.createWorker("eng", 2, {
    legacyCore: true,
    legacyLang: true,
  });

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.OSD_ONLY,
  });

  return scheduler.addWorker(worker);
};

export const addWorkersToTesseractScheduler = async ({
  numWorkers,
  scheduler,
}: {
  numWorkers: number;
  scheduler: Tesseract.Scheduler;
}) => {
  let resArr = Array.from({ length: numWorkers });

  await Promise.all(resArr.map(() => createAndAddWorker(scheduler)));

  return true;
};

export const terminateScheduler = (scheduler: Tesseract.Scheduler) => {
  return scheduler.terminate();
};

export const validateLLMParams = (params: Partial<LLMParams>): LLMParams => {
  const validKeys = Object.keys(defaultLLMParams);

  for (const [key, value] of Object.entries(params)) {
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid LLM parameter: ${key}`);
    }
    if (typeof value !== "number") {
      throw new Error(`Value for '${key}' must be a number`);
    }
  }

  return { ...defaultLLMParams, ...params };
};

export const encodeImageToBase64 = async (imagePath: string) => {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString("base64");
};

// Strip out the ```markdown wrapper
export const formatMarkdown = (text: string) => {
  let formattedMarkdown = text?.trim();
  let loopCount = 0;
  const maxLoops = 3;

  const startsWithMarkdown = formattedMarkdown.startsWith("```markdown");
  while (startsWithMarkdown && loopCount < maxLoops) {
    const endsWithClosing = formattedMarkdown.endsWith("```");

    if (startsWithMarkdown && endsWithClosing) {
      const outermostBlockRegex = /^```markdown\n([\s\S]*?)\n```$/;
      const match = outermostBlockRegex.exec(formattedMarkdown);

      if (match) {
        formattedMarkdown = match[1].trim();
        loopCount++;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return formattedMarkdown;
};

export const isString = (value: string | null): value is string => {
  return value !== null;
};

export const isValidUrl = (string: string): boolean => {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
};

// Save file to local tmp directory
export const downloadFile = async ({
  filePath,
  tempDir,
}: {
  filePath: string;
  tempDir: string;
}): Promise<{ extension: string; localPath: string }> => {
  const fileNameExt = path.extname(filePath.split("?")[0]);
  const localPath = path.join(tempDir, uuidv4() + fileNameExt);

  let mimetype;

  // Check if filePath is a URL
  if (isValidUrl(filePath)) {
    const writer = fs.createWriteStream(localPath);

    const response = await axios({
      url: filePath,
      method: "GET",
      responseType: "stream",
    });

    if (response.status !== 200) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    mimetype = response.headers?.["content-type"];
    await pipeline(response.data, writer);
  } else {
    // If filePath is a local file, copy it to the temp directory
    await fs.copyFile(filePath, localPath);
  }

  if (!mimetype) {
    mimetype = mime.lookup(localPath);
  }

  let extension = mime.extension(mimetype) || "";
  if (!extension) {
    if (mimetype === "binary/octet-stream") {
      extension = ".bin";
    } else {
      throw new Error("File extension missing");
    }
  }

  if (!extension.startsWith(".")) {
    extension = `.${extension}`;
  }

  return { extension, localPath };
};

// Determine the optimal image orientation based on OCR confidence
// Run Tesseract on 4 image orientations and compare the outputs
const determineOptimalRotation = async ({
  image,
  scheduler,
}: {
  image: sharp.Sharp;
  scheduler: Tesseract.Scheduler;
}): Promise<number> => {
  const imageBuffer = await image.toBuffer();
  const {
    data: { orientation_confidence, orientation_degrees },
  } = await scheduler.addJob("detect", imageBuffer);

  if (orientation_degrees) {
    console.log(
      `Reorienting image ${orientation_degrees} degrees (confidence: ${orientation_confidence}%)`
    );
    return orientation_degrees;
  }
  return 0;
};

// Convert each page to a png, correct orientation, and save that image to tmp
export const convertPdfToImages = async ({
  correctOrientation,
  localPath,
  maxTesseractWorkers,
  pagesToConvertAsImages,
  scheduler,
  tempDir,
  trimEdges,
}: {
  correctOrientation: boolean;
  localPath: string;
  maxTesseractWorkers: number;
  pagesToConvertAsImages: number | number[];
  scheduler: Tesseract.Scheduler | null;
  tempDir: string;
  trimEdges: boolean;
}) => {
  const options = {
    density: 300,
    format: "png",
    height: 2048,
    preserveAspectRatio: true,
    saveFilename: path.basename(localPath, path.extname(localPath)),
    savePath: tempDir,
  };
  const storeAsImage = fromPath(localPath, options);

  try {
    const convertResults = await storeAsImage.bulk(pagesToConvertAsImages, {
      responseType: "buffer",
    });

    if (correctOrientation) {
      const numRequiredWorkers = convertResults.length;
      let numNewWorkers = numRequiredWorkers - NUM_STARTING_WORKERS;

      if (maxTesseractWorkers !== -1) {
        const numPreviouslyInitiatedWorkers =
          maxTesseractWorkers < NUM_STARTING_WORKERS
            ? maxTesseractWorkers
            : NUM_STARTING_WORKERS;

        if (numRequiredWorkers > numPreviouslyInitiatedWorkers) {
          numNewWorkers = Math.min(
            numRequiredWorkers - numPreviouslyInitiatedWorkers,
            maxTesseractWorkers - numPreviouslyInitiatedWorkers
          );
        } else {
          numNewWorkers = 0;
        }
      }

      // Add more workers if needed
      if (numNewWorkers > 0 && maxTesseractWorkers !== 0 && scheduler)
        addWorkersToTesseractScheduler({
          numWorkers: numNewWorkers,
          scheduler,
        });
    }

    await Promise.all(
      convertResults.map(async (result) => {
        if (!result || !result.buffer) {
          throw new Error("Could not convert page to image buffer");
        }
        if (!result.page) throw new Error("Could not identify page data");
        const paddedPageNumber = result.page.toString().padStart(5, "0");

        const correctedBuffer = await cleanupImage({
          correctOrientation,
          imageBuffer: result.buffer,
          scheduler,
          trimEdges,
        });

        const imagePath = path.join(
          tempDir,
          `${options.saveFilename}_page_${paddedPageNumber}.png`
        );
        await fs.writeFile(imagePath, correctedBuffer);
      })
    );
    return convertResults;
  } catch (err) {
    console.error("Error during PDF conversion:", err);
    throw err;
  }
};

// Convert each page (from other formats like docx) to a png and save that image to tmp
export const convertFileToPdf = async ({
  extension,
  localPath,
  tempDir,
}: {
  extension: string;
  localPath: string;
  tempDir: string;
}): Promise<string> => {
  const inputBuffer = await fs.readFile(localPath);
  const outputFilename = path.basename(localPath, extension) + ".pdf";
  const outputPath = path.join(tempDir, outputFilename);

  try {
    const pdfBuffer = await convertAsync(inputBuffer, ".pdf", undefined);
    await fs.writeFile(outputPath, pdfBuffer);
    return outputPath;
  } catch (err) {
    console.error(`Error converting ${extension} to .pdf:`, err);
    throw err;
  }
};

const camelToSnakeCase = (str: string) =>
  str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);

export const convertKeysToSnakeCase = (
  obj: Record<string, any> | null
): Record<string, any> => {
  if (typeof obj !== "object" || obj === null) {
    return obj ?? {};
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [camelToSnakeCase(key), value])
  );
};

export const cleanupImage = async ({
  correctOrientation,
  imageBuffer,
  scheduler,
  trimEdges,
}: CleanupImageProps) => {
  const image = sharp(imageBuffer);

  // Trim extra space around the content in the image
  if (trimEdges) {
    image.trim();
  }

  // scheduler would always be non-null if correctOrientation is true
  // Adding this check to satisfy typescript
  if (correctOrientation && scheduler) {
    const optimalRotation = await determineOptimalRotation({
      image,
      scheduler,
    });

    if (optimalRotation) {
      image.rotate(optimalRotation);
    }
  }

  // Correct the image orientation
  const correctedBuffer = await image.toBuffer();
  return correctedBuffer;
};

/**
 *
 * @param markdownString String - Markdown text
 * @param page Number - Page number
 * @returns ProcessedNode[] - Array of processed nodes
 */
export const markdownToJson = async (markdownString: string, page: number) => {
  /**
   * Bypassing typescript transpiler using eval to use dynamic imports
   *
   * Source: https://stackoverflow.com/a/70546326
   */
  const { unified } = await eval(`import('unified')`);
  const { default: remarkParse } = await eval(`import('remark-parse')`);
  const { default: remarkGfm } = await eval(`import('remark-gfm')`);

  const parsedMd = unified()
    .use(remarkParse) // Parse Markdown to AST
    .use(remarkGfm)
    .parse(markdownString);

  const parentIdManager: ParentId[] = [];

  const processedNodes: ProcessedNode[] = [];
  parsedMd.children.forEach((sourceNode: any) => {
    const isHeading = sourceNode.type === MdNodeType.heading;

    if (isHeading && sourceNode.depth <= (parentIdManager.at(-1)?.depth || 0)) {
      for (let i = parentIdManager.length; i > 0; i--) {
        parentIdManager.pop();
        if (sourceNode.depth > (parentIdManager.at(-1)?.depth || 0)) {
          break;
        }
      }
    }
    const processedNode = processRootNode(
      sourceNode,
      page,
      parentIdManager.at(-1)?.id
    );

    if (isHeading) {
      parentIdManager.push({
        id: processedNode[0].id,
        depth: sourceNode.depth,
      });
    }

    processedNodes.push(...processedNode);
  });

  return processedNodes;
};

// MD (mdast) type source: https://github.com/syntax-tree/mdast?tab=readme-ov-file

// All of the parent nodes are composed of these literals.
const literals = new Set([
  MdNodeType.code,
  MdNodeType.html,
  MdNodeType.inlineCode,
  MdNodeType.text,
]);

// No data will be pulled from these nodes.
const ignoreNodeTypes = new Set([
  MdNodeType.break,
  MdNodeType.definition,
  MdNodeType.image,
  MdNodeType.imageReference,
  MdNodeType.thematicBreak,
]);

const gatherValue = (result: any) =>
  result.filter((r: any) => Boolean(r)).map((r: any) => r.mainNode.value);
const gatherSiblings = (result: any) =>
  result.reduce(
    (acc: any[], r: any) => (Boolean(r) ? acc.concat(r.siblings) : acc),
    []
  );

const nodeProcessors = {
  // Default processor for "literal" nodes
  literal: (node: any) => ({ value: node.value, siblings: [] }),
  [MdNodeType.list]: (node: any, page: number) => {
    const result = node.children.map((childNode: any) =>
      processNode(childNode, page)
    );

    return {
      value: gatherValue(result),
      siblings: gatherSiblings(result),
    };
  },
  [MdNodeType.listItem]: (node: any, page: number) => {
    const result = processListItem(node, page);
    return {
      value: result.node,
      siblings: result.siblings,
    };
  },
  [MdNodeType.table]: (node: any, page: number) => {
    const [headerNodes, ...rowNodes] = node.children;

    const headers = headerNodes.children.map((child: any) => {
      const pn = processNode(child, page)?.mainNode;
      return pn ? { value: pn.value, id: pn.id } : {};
    });

    const rows = rowNodes.map((rowNode: any) => {
      return Object.fromEntries(
        rowNode.children.map((cellNode: any, idx: number) => {
          const headerId = headers[idx]?.id;
          if (!headerId) return [];

          return [
            headerId,
            cellNode.children
              .map((child: any) => processNode(child, page)?.mainNode.value)
              .join(" "),
          ];
        })
      );
    });

    return {
      value: {
        headers,
        rows,
      },
      siblings: [],
    };
  },
  // Default processor for "parent" nodes
  parent: (node: any, page: number) => {
    const result: string[] = node.children.map((childNode: any) =>
      processNode(childNode, page)
    );

    return {
      value: gatherValue(result).join(" "),
      siblings: gatherSiblings(result),
    };
  },
};

const processRootNode = (
  node: any,
  page: number,
  parentId?: string
): ProcessedNode[] => {
  const nodes = processNode(node, page, parentId);

  if (!nodes) return [];

  return [nodes.mainNode, ...nodes.siblings];
};

const processNode = (
  node: any,
  page: number,
  parentId?: string
): { mainNode: ProcessedNode; siblings: ProcessedNode[] } | undefined => {
  let value: string | ListItem[];
  let siblingNodes: ProcessedNode[] = [];
  let result;

  if (literals.has(node.type)) {
    result = nodeProcessors["literal"](node);
  } else if (node.type in nodeProcessors) {
    result = nodeProcessors[node.type as keyof typeof nodeProcessors](
      node,
      page
    );
  } else if (!ignoreNodeTypes.has(node.type)) {
    result = nodeProcessors["parent"](node, page);
  } else {
    return;
  }

  value = result.value;
  siblingNodes = result.siblings;

  return {
    mainNode: {
      id: nanoid(),
      page,
      parentId,
      type:
        ConvertedNodeType[node.type as ConvertedNodeType] ||
        ConvertedNodeType.text,
      value: value as any,
    },
    siblings: siblingNodes,
  };
};

const processListItem = (node: any, page: number) => {
  let newNode: ProcessedNode | undefined;
  let siblings: ProcessedNode[] = [];

  node.children.forEach((childNode: any) => {
    if (childNode.type !== MdNodeType.list) {
      const processedNode = processNode(childNode, page);
      if (!processedNode) return;

      if (newNode) {
        newNode.value += processedNode.mainNode.value as string;
      } else {
        newNode = processedNode.mainNode;
      }
      siblings.push(...processedNode.siblings);
    } else {
      if (!newNode) {
        newNode = {
          id: nanoid(),
          parentId: undefined,
          type: ConvertedNodeType.text,
          value: "",
        };
      }

      const processedNode = processNode(childNode, page, newNode?.id);
      if (processedNode)
        siblings.push(processedNode.mainNode, ...processedNode.siblings);
    }
  });

  return { node: newNode, siblings };
};
