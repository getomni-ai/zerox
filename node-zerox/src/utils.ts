import {
  AnalyzeDocumentCommand,
  TextractClient,
} from "@aws-sdk/client-textract";
import { convert } from "libreoffice-convert";
import { fromPath } from "pdf2pic";
import { LayoutElement, LLMParams, TextractConfig } from "./types";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import * as Tesseract from "tesseract.js";
import axios from "axios";
import fs from "fs-extra";
import mime from "mime-types";
import path from "path";
import sharp from "sharp";

const convertAsync = promisify(convert);

const MIN_ROTATION_CONFIDENCE = 60;

const defaultLLMParams: LLMParams = {
  frequencyPenalty: 0, // OpenAI defaults to 0
  maxTokens: 2000,
  presencePenalty: 0, // OpenAI defaults to 0
  temperature: 0,
  topP: 1, // OpenAI defaults to 1
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
  // Shorten the file name by removing URL parameters
  const baseFileName = path.basename(filePath.split("?")[0]);
  const localPath = path.join(tempDir, baseFileName);
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

// Extract text confidence from image buffer using Tesseract
export const getTextFromImage = async (
  buffer: Buffer
): Promise<{ confidence: number }> => {
  try {
    // Get image and metadata
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Crop to a 150px wide column in the center of the document.
    // This section produced the highest confidence/speed tradeoffs.
    const cropWidth = 150;
    const cropHeight = metadata.height || 0;
    const left = Math.max(0, Math.floor((metadata.width! - cropWidth) / 2));
    const top = 0;

    // Extract the cropped image
    const croppedBuffer = await image
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .toBuffer();

    // Pass the croppedBuffer to Tesseract.recognize
    // @TODO: How can we generalize this to non eng languages?
    const {
      data: { confidence },
    } = await Tesseract.recognize(croppedBuffer, "eng");

    return { confidence };
  } catch (error) {
    console.error("Error during OCR:", error);
    return { confidence: 0 };
  }
};

// Determine the optimal image orientation based on OCR confidence
// Run Tesseract on 4 image orientations and compare the outputs
const determineOptimalRotation = async (
  image: sharp.Sharp
): Promise<number> => {
  const rotations = [0, 90, 180, 270];

  const results = await Promise.all(
    rotations.map(async (rotation) => {
      const rotatedImageBuffer = await image
        .clone()
        .rotate(rotation)
        .toBuffer();
      const { confidence } = await getTextFromImage(rotatedImageBuffer);
      return { rotation, confidence };
    })
  );

  // Find the rotation with the best confidence score
  const bestResult = results.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );

  if (
    bestResult.confidence >= MIN_ROTATION_CONFIDENCE &&
    bestResult.rotation !== 0
  ) {
    console.log(
      `Reorienting image ${bestResult.rotation} degrees (confidence: ${bestResult.confidence}%)`
    );
    return bestResult.rotation;
  }
  return 0;
};

// Convert each page to a png, correct orientation, and save that image to tmp
export const convertPdfToImages = async ({
  correctOrientation,
  localPath,
  pagesToConvertAsImages,
  tempDir,
  textractConfig,
  trimEdges,
  useBoundingBoxes,
}: {
  correctOrientation: boolean;
  localPath: string;
  pagesToConvertAsImages: number | number[];
  tempDir: string;
  textractConfig?: TextractConfig;
  trimEdges: boolean;
  useBoundingBoxes?: boolean;
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
    await Promise.all(
      convertResults.map(async (result) => {
        if (!result || !result.buffer) {
          throw new Error("Could not convert page to image buffer");
        }
        if (!result.page) throw new Error("Could not identify page data");
        const paddedPageNumber = result.page.toString().padStart(5, "0");

        let image = sharp(result.buffer);

        if (trimEdges) {
          const trimmedBuffer = await image.trim().toBuffer();
          image = sharp(trimmedBuffer);
        }

        if (correctOrientation) {
          const optimalRotation = await determineOptimalRotation(image);

          if (optimalRotation) {
            const rotatedBuffer = await image
              .rotate(optimalRotation)
              .toBuffer();
            image = sharp(rotatedBuffer);
          }
        }

        if (useBoundingBoxes) {
          const boundingBoxes = await analyzeBoundingBoxes(
            image,
            textractConfig
          );
          const { width: imageWidth, height: imageHeight } =
            await image.metadata();

          if (!imageWidth || !imageHeight) {
            throw new Error("Could not determine image dimensions");
          }

          await Promise.all(
            boundingBoxes.map(async (element, index) => {
              const { boundingBox } = element;

              const elementImage = image.clone().extract({
                height: Math.round(boundingBox.height * imageHeight),
                left: Math.round(boundingBox.left * imageWidth),
                top: Math.round(boundingBox.top * imageHeight),
                width: Math.round(boundingBox.width * imageWidth),
              });

              const elementImagePath = path.join(
                tempDir,
                `${options.saveFilename}_page_${paddedPageNumber}_element_${
                  index + 1
                }.png`
              );

              const buffer = await elementImage.toBuffer();
              await fs.writeFile(elementImagePath, buffer);
            })
          );
        } else {
          const imagePath = path.join(
            tempDir,
            `${options.saveFilename}_page_${paddedPageNumber}.png`
          );

          const buffer = await image.toBuffer();
          await fs.writeFile(imagePath, buffer);
        }
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

const analyzeBoundingBoxes = async (
  image: sharp.Sharp,
  config?: TextractConfig
): Promise<LayoutElement[]> => {
  const textractClient = new TextractClient({
    credentials: config?.credentials,
    region: config?.region || "us-east-1",
  });

  const { Blocks = [] } = await textractClient.send(
    new AnalyzeDocumentCommand({
      Document: { Bytes: await image.toBuffer() },
      FeatureTypes: ["LAYOUT"],
    })
  );
  return Blocks.filter((block) =>
    (block.BlockType || "").startsWith("LAYOUT_")
  ).map((block) => ({
    boundingBox: {
      left: block.Geometry?.BoundingBox?.Left || 0,
      top: block.Geometry?.BoundingBox?.Top || 0,
      width: block.Geometry?.BoundingBox?.Width || 0,
      height: block.Geometry?.BoundingBox?.Height || 0,
    },
    type: block.BlockType,
  }));
};
