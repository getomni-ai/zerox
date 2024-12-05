import {
  addWorkersToTesseractScheduler,
  cleanupImage,
  convertFileToPdf,
  convertPdfToImages,
  downloadFile,
  formatMarkdown,
  getTesseractScheduler,
  isString,
  terminateScheduler,
} from "./utils";
import { getCompletion } from "./openAI";
import { ModelOptions, ZeroxArgs, ZeroxOutput } from "./types";
import { validateLLMParams } from "./utils";
import fs from "fs-extra";
import os from "os";
import path from "path";
import pLimit, { Limit } from "p-limit";
import { NUM_STARTING_WORKERS } from "./constants";
import Tesseract from "tesseract.js";

export const zerox = async ({
  cleanup = true,
  concurrency = 10,
  correctOrientation = true,
  density = 300,
  filePath,
  height = 2048,
  llmParams = {},
  maintainFormat = false,
  maxTesseractWorkers = -1,
  model = ModelOptions.gpt_4o_mini,
  onPostProcess,
  onPreProcess,
  openaiAPIKey = "",
  outputDir,
  pagesToConvertAsImages = -1,
  tempDir = os.tmpdir(),
  trimEdges = true,
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
  let scheduler: Tesseract.Scheduler | null = null;

  if (correctOrientation) {
    scheduler = await getTesseractScheduler();
    const workerCount =
      maxTesseractWorkers !== -1 && maxTesseractWorkers < NUM_STARTING_WORKERS
        ? maxTesseractWorkers
        : NUM_STARTING_WORKERS;
    await addWorkersToTesseractScheduler({
      numWorkers: workerCount,
      scheduler,
    });
  }

  try {
    // Ensure temp directory exists + create temp folder
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const tempDirectory = path.join(
      tempDir || os.tmpdir(),
      `zerox-temp-${rand}`
    );
    const sourceDirectory = path.join(tempDirectory, 'source')
    const processedDirectory = path.join(tempDirectory, 'processed')
    await fs.ensureDir(sourceDirectory);
    await fs.ensureDir(processedDirectory);

    // Download the PDF. Get file name.
    const { extension, localPath } = await downloadFile({
      filePath,
      tempDir: sourceDirectory,
    });
    if (!localPath) throw "Failed to save file to local drive";

    // Sort the `pagesToConvertAsImages` array to make sure we use the right index
    // for `formattedPages` as `pdf2pic` always returns images in order
    if (Array.isArray(pagesToConvertAsImages)) {
      pagesToConvertAsImages.sort((a, b) => a - b);
    }

    // Convert file to PDF if necessary
    if (extension !== ".png") {
      let pdfPath: string;
      if (extension === ".pdf") {
        pdfPath = localPath;
      } else {
        pdfPath = await convertFileToPdf({
          extension,
          localPath,
          tempDir: sourceDirectory,
        });
      }
      // Convert the file to a series of images
      await convertPdfToImages({
        correctOrientation,
        density,
        height,
        localPath: pdfPath,
        maxTesseractWorkers,
        pagesToConvertAsImages,
        scheduler,
        tempDir: processedDirectory,
        trimEdges,
      });
    } else if (correctOrientation) {
      const imageBuffer = await fs.readFile(localPath);

      const correctedBuffer = await cleanupImage({
        correctOrientation,
        imageBuffer,
        scheduler,
        trimEdges,
      });

      const imagePath = path.join(
        processedDirectory,
        `${path.basename(localPath, path.extname(localPath))}_clean.png`
      );
      await fs.writeFile(imagePath, correctedBuffer);
    }

    const endOfPath = localPath.split("/")[localPath.split("/").length - 1];
    const rawFileName = endOfPath.split(".")[0];
    const fileName = rawFileName
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_")
      .toLowerCase()
      .substring(0, 255); // Truncate file name to 255 characters to prevent ENAMETOOLONG errors

    // Get list of converted images
    const files = await fs.readdir(processedDirectory);
    const images = files.filter((file) => file.endsWith(".png"));

    if (maintainFormat) {
      // Use synchronous processing
      for (const image of images) {
        const imagePath = path.join(processedDirectory, image);
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
          throw error;
        }
      }
    } else {
      // Process in parallel with a limit on concurrent pages
      const processPage = async (
        image: string,
        pageNumber: number
      ): Promise<string | null> => {
        const imagePath = path.join(processedDirectory, image);
        try {
          if (onPreProcess) {
            await onPreProcess({ imagePath, pageNumber });
          }

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

          if (onPostProcess) {
            await onPostProcess({ content, pageNumber });
          }

          // Add all markdown results to array
          return formattedMarkdown;
        } catch (error) {
          console.error(`Failed to process image ${image}:`, error);
          throw error;
        }
      };

      // Function to process pages with concurrency limit
      const processPagesInBatches = async (images: string[], limit: Limit) => {
        const results: (string | null)[] = [];

        const promises = images.map((image, index) =>
          limit(() =>
            processPage(image, index + 1).then((result) => {
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
      let pageNumber;
      // If we convert all pages, just use the array index
      if (pagesToConvertAsImages === -1) {
        pageNumber = i + 1;
      }
      // Else if we convert specific pages, use the page number from the parameter
      else if (Array.isArray(pagesToConvertAsImages)) {
        pageNumber = pagesToConvertAsImages[i];
      }
      // Else, the parameter is a number and use it for the page number
      else {
        pageNumber = pagesToConvertAsImages;
      }

      return { content: el, page: pageNumber, contentLength: el.length };
    });

    return {
      completionTime,
      fileName,
      inputTokens: inputTokenCount,
      outputTokens: outputTokenCount,
      pages: formattedPages,
    };
  } finally {
    if (correctOrientation && scheduler) {
      terminateScheduler(scheduler);
    }
  }
};
