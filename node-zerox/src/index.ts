import os from "os";
import fs from "fs-extra";
import path from "path";
import pLimit, { Limit } from "p-limit";
import Tesseract from "tesseract.js";

import {
  addWorkersToTesseractScheduler,
  cleanupImage,
  convertFileToPdf,
  convertPdfToImages,
  downloadFile,
  formatMarkdown,
  getTesseractScheduler,
  terminateScheduler,
  validateLLMParams,
  prepareWorkersForImageProcessing,
} from "./utils";
import { getCompletion } from "./models";
import {
  ErrorMode,
  ModelOptions,
  Page,
  PageStatus,
  ZeroxArgs,
  ZeroxOutput,
} from "./types";
import { NUM_STARTING_WORKERS } from "./constants";

export const zerox = async ({
  cleanup = true,
  concurrency = 10,
  correctOrientation = true,
  errorMode = ErrorMode.IGNORE,
  filePath,
  llmParams = {},
  maintainFormat = false,
  maxRetries = 1,
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
  const pages: Page[] = [];
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

  const orientationStartTime = Date.now();
  // Add initial tesseract workers if we need to correct orientation
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

  const orientationEndTime = Date.now();
  console.log(
    "time to apply orientation correction",
    `${(orientationEndTime - orientationStartTime) / 1000}s`
  );

  try {
    // Ensure temp directory exists + create temp folder
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const tempDirectory = path.join(
      tempDir || os.tmpdir(),
      `zerox-temp-${rand}`
    );
    const sourceDirectory = path.join(tempDirectory, "source");
    const processedDirectory = path.join(tempDirectory, "processed");
    await fs.ensureDir(sourceDirectory);
    await fs.ensureDir(processedDirectory);

    // Download the PDF. Get file name.
    const { extension, localPath } = await downloadFile({
      filePath,
      tempDir: sourceDirectory,
    });
    const downloadEndTime = Date.now();
    console.log(
      "time to download file",
      `${(downloadEndTime - orientationEndTime) / 1000}s`
    );
    if (!localPath) throw "Failed to save file to local drive";

    // Sort the `pagesToConvertAsImages` array to make sure we use the right index
    // for `formattedPages` as `pdf2pic` always returns images in order
    if (Array.isArray(pagesToConvertAsImages)) {
      pagesToConvertAsImages.sort((a, b) => a - b);
    }

    // Read the image file or convert the file to images
    let imagePaths: string[] = [];
    if (extension === ".png") {
      imagePaths = [localPath];
    } else {
      let pdfPath: string;
      if (extension === ".pdf") {
        pdfPath = localPath;
      } else {
        // Convert file to PDF if necessary
        pdfPath = await convertFileToPdf({
          extension,
          localPath,
          tempDir: sourceDirectory,
        });
      }
      imagePaths = await convertPdfToImages({
        pdfPath,
        pagesToConvertAsImages,
        tempDir: sourceDirectory,
      });
    }

    const convertEndTime = Date.now();
    console.log(
      "time to convert file to images",
      `${(convertEndTime - downloadEndTime) / 1000}s`
    );

    if (correctOrientation) {
      await prepareWorkersForImageProcessing({
        maxTesseractWorkers,
        numImages: imagePaths.length,
        scheduler,
      });
    }

    const preparedWorkersEndTime = Date.now();
    console.log(
      "time to prepare workers",
      `${(preparedWorkersEndTime - convertEndTime) / 1000}s`
    );

    // Start processing the images using LLM
    let numSuccessfulPages = 0;
    let numFailedPages = 0;

    if (maintainFormat) {
      // Use synchronous processing
      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];
        const imageBuffer = await fs.readFile(imagePath);
        const correctedBuffer = await cleanupImage({
          correctOrientation,
          imageBuffer,
          scheduler,
          trimEdges,
        });

        let retryCount = 0;

        while (retryCount <= maxRetries) {
          try {
            const { content, inputTokens, outputTokens } = await getCompletion({
              apiKey: openaiAPIKey,
              image: correctedBuffer,
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

            pages.push({
              content: formattedMarkdown,
              contentLength: formattedMarkdown.length,
              page: i + 1,
              status: PageStatus.SUCCESS,
              inputTokens,
              outputTokens,
            });
            numSuccessfulPages++;
            break;
          } catch (error) {
            if (retryCount < maxRetries) {
              console.log(`Retrying page ${i + 1}...`);
              retryCount++;
              continue;
            }

            console.error(`Failed to process image ${imagePath}:`, error);
            if (errorMode === ErrorMode.THROW) {
              throw error;
            }

            pages.push({
              content: "",
              contentLength: 0,
              error: `Failed to process page ${i + 1}: ${error}`,
              page: i + 1,
              status: PageStatus.ERROR,
            });
            numFailedPages++;
            break;
          }
        }
      }
    } else {
      // Process in parallel with a limit on concurrent pages
      const processPage = async (
        imagePath: string,
        pageNumber: number,
        retryCount = 0
      ): Promise<Page> => {
        const imageBuffer = await fs.readFile(imagePath);
        const correctedBuffer = await cleanupImage({
          correctOrientation,
          imageBuffer,
          scheduler,
          trimEdges,
        });

        if (onPreProcess) {
          await onPreProcess({ imagePath, pageNumber });
        }

        let page: Page;
        try {
          const { content, inputTokens, outputTokens } = await getCompletion({
            apiKey: openaiAPIKey,
            image: correctedBuffer,
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

          page = {
            content: formattedMarkdown,
            contentLength: formattedMarkdown.length,
            page: pageNumber,
            status: PageStatus.SUCCESS,
            inputTokens,
            outputTokens,
          };
          numSuccessfulPages++;
        } catch (error) {
          if (retryCount <= maxRetries) {
            console.log(`Retrying page ${pageNumber}...`);
            return processPage(imagePath, pageNumber, retryCount + 1);
          }

          console.error(`Failed to process image ${imagePath}:`, error);
          if (errorMode === ErrorMode.THROW) {
            throw error;
          }

          page = {
            content: "",
            contentLength: 0,
            error: `Failed to process page ${pageNumber}: ${error}`,
            page: pageNumber,
            status: PageStatus.ERROR,
          };
          numFailedPages++;
        }

        if (onPostProcess) {
          await onPostProcess({
            page,
            progressSummary: {
              numPages: imagePaths.length,
              numSuccessfulPages,
              numFailedPages,
            },
          });
        }

        return page;
      };

      // Function to process pages with concurrency limit
      const processPagesInBatches = async (
        imagePaths: string[],
        limit: Limit
      ) => {
        const promises = imagePaths.map((imagePath, index) =>
          limit(() =>
            processPage(imagePath, index + 1).then((result) => {
              // Update the pages array with the result
              pages[index] = result;
            })
          )
        );
        await Promise.all(promises);
      };

      const limit = pLimit(concurrency);
      await processPagesInBatches(imagePaths, limit);
    }

    const ocrEndTime = Date.now();
    console.log(
      "time to OCR pages",
      `${(ocrEndTime - preparedWorkersEndTime) / 1000}s`
    );

    // Write the aggregated markdown to a file
    const endOfPath = localPath.split("/")[localPath.split("/").length - 1];
    const rawFileName = endOfPath.split(".")[0];
    const fileName = rawFileName
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "_")
      .toLowerCase()
      .substring(0, 255); // Truncate file name to 255 characters to prevent ENAMETOOLONG errors

    if (outputDir) {
      const resultFilePath = path.join(outputDir, `${fileName}.md`);
      const content = pages.map((page) => page.content).join("\n\n");
      await fs.writeFile(resultFilePath, content);
    }

    // Cleanup the downloaded PDF file
    if (cleanup) await fs.remove(tempDirectory);

    // Format JSON response
    const endTime = new Date();
    const completionTime = endTime.getTime() - startTime.getTime();

    const formattedPages = pages.map((page, i) => {
      let correctPageNumber;
      // If we convert all pages, just use the array index
      if (pagesToConvertAsImages === -1) {
        correctPageNumber = i + 1;
      }
      // Else if we convert specific pages, use the page number from the parameter
      else if (Array.isArray(pagesToConvertAsImages)) {
        correctPageNumber = pagesToConvertAsImages[i];
      }
      // Else, the parameter is a number and use it for the page number
      else {
        correctPageNumber = pagesToConvertAsImages;
      }

      // Return the page with the correct page number
      const result: Page = {
        ...page,
        page: correctPageNumber,
      };

      return result;
    });

    const writeEndTime = Date.now();
    console.log(
      "time to write results to file",
      `${(writeEndTime - ocrEndTime) / 1000}s`
    );

    return {
      completionTime,
      fileName,
      inputTokens: inputTokenCount,
      outputTokens: outputTokenCount,
      pages: formattedPages,
      summary: {
        numPages: formattedPages.length,
        numSuccessfulPages,
        numFailedPages,
      },
    };
  } finally {
    if (correctOrientation && scheduler) {
      terminateScheduler(scheduler);
    }
  }
};
