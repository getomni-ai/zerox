import os from "os";
import fs from "fs-extra";
import path from "path";
import pLimit, { Limit } from "p-limit";
import Tesseract from "tesseract.js";

import "./handleWarnings";
import {
  addWorkersToTesseractScheduler,
  cleanupImage,
  CompletionProcessor,
  convertFileToPdf,
  convertPdfToImages,
  downloadFile,
  getTesseractScheduler,
  isCompletionResponse,
  prepareWorkersForImageProcessing,
  splitSchema,
  terminateScheduler,
} from "./utils";
import { createModel } from "./models";
import {
  ErrorMode,
  ModelOptions,
  ModelProvider,
  OperationMode,
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
  credentials = { apiKey: "" },
  errorMode = ErrorMode.IGNORE,
  extractPerPage,
  filePath,
  imageDensity = 300,
  imageHeight = 2048,
  llmParams = {},
  maintainFormat = false,
  maxRetries = 1,
  maxTesseractWorkers = -1,
  mode = OperationMode.OCR,
  model = ModelOptions.OPENAI_GPT_4O,
  modelProvider = ModelProvider.OPENAI,
  onPostProcess,
  onPreProcess,
  openaiAPIKey = "",
  outputDir,
  pagesToConvertAsImages = -1,
  schema,
  tempDir = os.tmpdir(),
  trimEdges = true,
}: ZeroxArgs): Promise<ZeroxOutput> => {
  let extracted: Record<string, unknown> = {};
  let inputTokenCount: number = 0;
  let outputTokenCount: number = 0;
  let priorPage: string = "";
  const pages: Page[] = [];
  const startTime = new Date();

  if (openaiAPIKey && openaiAPIKey.length > 0) {
    modelProvider = ModelProvider.OPENAI;
    credentials = { apiKey: openaiAPIKey };
  }

  // Validators
  if (Object.values(credentials).every((credential) => !credential)) {
    throw new Error("Missing credentials");
  }
  if (!filePath || !filePath.length) {
    throw new Error("Missing file path");
  }
  if (mode === OperationMode.EXTRACTION && !schema) {
    throw new Error("Schema is required for extraction mode");
  }
  if (maintainFormat && mode === OperationMode.EXTRACTION) {
    throw new Error("Maintain format is only supported in OCR mode");
  }
  let scheduler: Tesseract.Scheduler | null = null;

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

  try {
    // Ensure temp directory exists + create temp folder
    const rand = Math.floor(1000 + Math.random() * 9000).toString();
    const tempDirectory = path.join(
      tempDir || os.tmpdir(),
      `zerox-temp-${rand}`
    );
    const sourceDirectory = path.join(tempDirectory, "source");
    await fs.ensureDir(sourceDirectory);

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
        imageDensity,
        imageHeight,
        pagesToConvertAsImages,
        tempDir: sourceDirectory,
      });
    }

    if (correctOrientation) {
      await prepareWorkersForImageProcessing({
        maxTesseractWorkers,
        numImages: imagePaths.length,
        scheduler,
      });
    }

    // Start processing the images using LLM
    let numSuccessfulPages: number = 0;
    let numFailedPages: number = 0;

    const modelInstance = createModel({
      credentials,
      llmParams,
      mode,
      model,
      provider: modelProvider,
    });

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
            const rawResponse = await modelInstance.getCompletion({
              image: correctedBuffer,
              maintainFormat,
              priorPage,
              schema,
            });
            const response = CompletionProcessor.process(mode, rawResponse);

            inputTokenCount += response.inputTokens;
            outputTokenCount += response.outputTokens;

            // Update prior page to result from last processing step
            if (isCompletionResponse(mode, response)) {
              priorPage = response.content;
            }

            pages.push({
              ...response,
              page: i + 1,
              status: PageStatus.SUCCESS,
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
    } else if (mode === OperationMode.OCR) {
      // Process OCR first
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
          const rawResponse = await modelInstance.getCompletion({
            image: correctedBuffer,
            maintainFormat: false,
            priorPage,
          });
          const response = CompletionProcessor.process(
            OperationMode.OCR,
            rawResponse
          );

          inputTokenCount += response.inputTokens;
          outputTokenCount += response.outputTokens;

          // Update prior page to result from last processing step
          if (isCompletionResponse(OperationMode.OCR, response)) {
            priorPage = response.content;
          }

          page = {
            ...response,
            page: pageNumber,
            status: PageStatus.SUCCESS,
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

    if (schema) {
      const { fullDocSchema, perPageSchema } = splitSchema(
        schema,
        extractPerPage
      );

      const processExtraction = async (
        input: string | string[],
        pageNumber: number,
        retryCount = 0,
        schema: Record<string, unknown>
      ): Promise<void> => {
        try {
          const rawResponse = await modelInstance.getCompletion({
            input,
            options: { correctOrientation, scheduler, trimEdges },
            schema,
          });

          const response = CompletionProcessor.process(
            OperationMode.EXTRACTION,
            rawResponse
          );

          inputTokenCount += response.inputTokens;
          outputTokenCount += response.outputTokens;
          numSuccessfulPages++;

          Object.keys(perPageSchema?.properties || {}).forEach((key) => {
            if (!extracted[key]) {
              extracted[key] = [];
            }
            const arr = extracted[key];
            if (
              response.extracted[key] !== null &&
              response.extracted[key] !== undefined &&
              Array.isArray(arr)
            ) {
              arr.push({
                page: pageNumber,
                value: response.extracted[key],
              });
            }
          });
        } catch (error) {
          if (retryCount < maxRetries) {
            await processExtraction(input, pageNumber, retryCount + 1, schema);
          } else {
            numFailedPages++;
            throw error;
          }
        }
      };

      if (mode === OperationMode.OCR) {
        if (perPageSchema) {
          await Promise.all(
            pages.map((page, index) =>
              processExtraction(page.content || "", index + 1, 0, perPageSchema)
            )
          );
        }
        if (fullDocSchema) {
          const content = pages.reduce((acc, el, i) => {
            if (i !== 0) acc += "\n<hr><hr>\n";
            acc += el.content;
            return acc;
          }, "");

          const rawResponse = await modelInstance.getCompletion({
            input: content,
            options: { correctOrientation, scheduler, trimEdges },
            schema: fullDocSchema,
          });
          const response = CompletionProcessor.process(
            OperationMode.EXTRACTION,
            rawResponse
          );

          inputTokenCount += response.inputTokens;
          outputTokenCount += response.outputTokens;
          extracted = { ...extracted, ...response?.extracted };
        }
      } else {
        if (perPageSchema) {
          await Promise.all(
            imagePaths.map((imagePath, index) =>
              processExtraction([imagePath], index + 1, 0, perPageSchema)
            )
          );
        }
        if (fullDocSchema) {
          const rawResponse = await modelInstance.getCompletion({
            input: imagePaths,
            options: { correctOrientation, scheduler, trimEdges },
            schema: fullDocSchema,
          });
          const response = CompletionProcessor.process(
            OperationMode.EXTRACTION,
            rawResponse
          );

          inputTokenCount += response.inputTokens;
          outputTokenCount += response.outputTokens;
          extracted = { ...extracted, ...response.extracted };
        }
      }
    }

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

    return {
      completionTime,
      extracted,
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
