import {
  convertFileToPdf,
  convertPdfToImages,
  downloadFile,
  formatMarkdown,
  isString,
} from "./utils";
import { getCompletion } from "./openAI";
import { ModelOptions, ZeroxArgs, ZeroxOutput } from "./types";
import { validateLLMParams } from "./utils";
import fs from "fs-extra";
import os from "os";
import path from "path";
import pLimit, { Limit } from "p-limit";

export const zerox = async ({
  cleanup = true,
  concurrency = 10,
  filePath,
  llmParams = {},
  maintainFormat = false,
  model = ModelOptions.gpt_4o_mini,
  openaiAPIKey = "",
  outputDir,
  tempDir = os.tmpdir(),
}: ZeroxArgs): Promise<ZeroxOutput> => {
  let inputTokenCount = 0;
  let outputTokenCount = 0;
  let priorPage = "";
  const aggregatedMarkdown: string[] = [];
  const startTime = new Date();

  llmParams = validateLLMParams(llmParams);

  // Validators
  if (!openaiAPIKey || !openaiAPIKey.length) {
    throw new Error("Missing OpenAI API key");
  }
  if (!filePath || !filePath.length) {
    throw new Error("Missing file path");
  }

  // Ensure temp directory exists + create temp folder
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  const tempDirectory = path.join(tempDir || os.tmpdir(), `zerox-temp-${rand}`);
  await fs.ensureDir(tempDirectory);

  // Download the PDF. Get file name.
  const localPath = await downloadFile({ filePath, tempDir: tempDirectory });
  if (!localPath) throw "Failed to save file to local drive";

  const fileExtension = path.extname(localPath).toLowerCase();

  if (!fileExtension) {
    throw new Error("File extension missing");
  }

  // Convert file to PDF if necessary
  if (fileExtension !== ".png") {
    let pdfPath: string;
    if (fileExtension === ".pdf") {
      pdfPath = localPath;
    } else {
      pdfPath = await convertFileToPdf({
        extension: fileExtension,
        localPath,
        tempDir: tempDirectory,
      });
    }
    // Convert the file to a series of images
    await convertPdfToImages({ localPath: pdfPath, tempDir: tempDirectory });
  }

  const endOfPath = localPath.split("/")[localPath.split("/").length - 1];
  const rawFileName = endOfPath.split(".")[0];
  const fileName = rawFileName
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  // Get list of converted images
  const files = await fs.readdir(tempDirectory);
  const images = files.filter((file) => file.endsWith(".png"));

  if (maintainFormat) {
    // Use synchronous processing
    for (const image of images) {
      const imagePath = path.join(tempDirectory, image);
      try {
        const { content, inputTokens, outputTokens } = await getCompletion({
          apiKey: openaiAPIKey,
          imagePath,
          llmParams,
          maintainFormat,
          model,
          priorPage,
        });
        const formattedMarkdown = formatMarkdown(content);
        inputTokenCount += inputTokens;
        outputTokenCount += outputTokens;

        // Update prior page to result from last processing step
        priorPage = formattedMarkdown;

        // Add all markdown results to array
        aggregatedMarkdown.push(formattedMarkdown);
      } catch (error) {
        console.error(`Failed to process image ${image}:`, error);
      }
    }
  } else {
    // Process in parallel with a limit on concurrent pages
    const processPage = async (image: string): Promise<string | null> => {
      const imagePath = path.join(tempDirectory, image);
      try {
        const { content, inputTokens, outputTokens } = await getCompletion({
          apiKey: openaiAPIKey,
          imagePath,
          llmParams,
          maintainFormat,
          model,
          priorPage,
        });
        const formattedMarkdown = formatMarkdown(content);
        inputTokenCount += inputTokens;
        outputTokenCount += outputTokens;

        // Update prior page to result from last processing step
        priorPage = formattedMarkdown;

        // Add all markdown results to array
        return formattedMarkdown;
      } catch (error) {
        console.error(`Failed to process image ${image}:`, error);
        return null;
      }
    };

    // Function to process pages with concurrency limit
    const processPagesInBatches = async (images: string[], limit: Limit) => {
      const results: (string | null)[] = [];

      const promises = images.map((image, index) =>
        limit(() =>
          processPage(image).then((result) => {
            results[index] = result;
          })
        )
      );

      await Promise.all(promises);
      return results;
    };

    const limit = pLimit(concurrency);
    const results = await processPagesInBatches(images, limit);
    const filteredResults = results.filter(isString);
    aggregatedMarkdown.push(...filteredResults);
  }

  // Write the aggregated markdown to a file
  if (outputDir) {
    const resultFilePath = path.join(outputDir, `${fileName}.md`);
    await fs.writeFile(resultFilePath, aggregatedMarkdown.join("\n\n"));
  }

  // Cleanup the downloaded PDF file
  if (cleanup) await fs.remove(tempDirectory);

  // Format JSON response
  const endTime = new Date();
  const completionTime = endTime.getTime() - startTime.getTime();
  const formattedPages = aggregatedMarkdown.map((el, i) => {
    return { content: el, page: i + 1, contentLength: el.length };
  });

  return {
    completionTime,
    fileName,
    inputTokens: inputTokenCount,
    outputTokens: outputTokenCount,
    pages: formattedPages,
  };
};
