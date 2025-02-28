import fs from "fs-extra";
import os from "os";
import path from "path";
import pLimit from "p-limit";
import Tesseract from "tesseract.js";

import "./handleWarnings";
import {
  addWorkersToTesseractScheduler,
  cleanupImage,
  CompletionProcessor,
  convertFileToPdf,
  convertHeicToJpeg,
  convertPdfToImages,
  downloadFile,
  getTesseractScheduler,
  isCompletionResponse,
  prepareWorkersForImageProcessing,
  runRetries,
  splitSchema,
  terminateScheduler,
} from "./utils";
import { createModel } from "./models";
import {
  CompletionResponse,
  ErrorMode,
  ExtractionResponse,
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
  customModelFunction,
  errorMode = ErrorMode.IGNORE,
  extractionCredentials,
  extractionLlmParams,
  extractionModel,
  extractionModelProvider,
  extractOnly = false,
  extractPerPage,
  filePath,
  imageDensity = 300,
  imageHeight = 2048,
  llmParams = {},
  maintainFormat = false,
  maxRetries = 1,
  maxTesseractWorkers = -1,
  model = ModelOptions.OPENAI_GPT_4O,
  modelProvider = ModelProvider.OPENAI,
  openaiAPIKey = "",
  outputDir,
  pagesToConvertAsImages = -1,
  schema,
  tempDir = os.tmpdir(),
  trimEdges = true,
}: ZeroxArgs): Promise<ZeroxOutput> => {
  let extracted: Record<string, unknown> | null = null;
  let inputTokenCount: number = 0;
  let outputTokenCount: number = 0;
  let priorPage: string = "";
  const pages: Page[] = [];
  const startTime = new Date();

  if (openaiAPIKey && openaiAPIKey.length > 0) {
    modelProvider = ModelProvider.OPENAI;
    credentials = { apiKey: openaiAPIKey };
  }

  extractionCredentials = extractionCredentials ?? credentials;
  extractionLlmParams = extractionLlmParams ?? llmParams;
  extractionModel = extractionModel ?? model;
  extractionModelProvider = extractionModelProvider ?? modelProvider;

  // Validators
  if (Object.values(credentials).every((credential) => !credential)) {
    throw new Error("Missing credentials");
  }
  if (!filePath || !filePath.length) {
    throw new Error("Missing file path");
  }
  if (extractOnly && !schema) {
    throw new Error("Schema is required for extraction mode");
  }
  if (extractOnly && maintainFormat) {
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
    if (extension === ".png" || extension === ".jpg" || extension === ".jpeg") {
      imagePaths = [localPath];
    } else if (extension === ".heic") {
      const imagePath = await convertHeicToJpeg({
        localPath,
        tempDir: sourceDirectory,
      });
      imagePaths = [imagePath];
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

    // Start processing OCR using LLM
    let numSuccessfulOCRRequests: number = 0;
    let numFailedOCRRequests: number = 0;

    const modelInstance = createModel({
      credentials,
      llmParams,
      model,
      provider: modelProvider,
    });

    const extractionModelInstance = createModel({
      credentials: extractionCredentials,
      llmParams: extractionLlmParams,
      model: extractionModel,
      provider: extractionModelProvider,
    });

    if (!extractOnly) {
      const processOCR = async (
        imagePath: string,
        pageNumber: number,
        maintainFormat: boolean
      ): Promise<Page> => {
        const imageBuffer = await fs.readFile(imagePath);
        const correctedBuffer = await cleanupImage({
          correctOrientation,
          imageBuffer,
          scheduler,
          trimEdges,
        });

        let page: Page;
        try {
          let rawResponse: CompletionResponse | ExtractionResponse;
          if (customModelFunction) {
            rawResponse = await runRetries(
              () =>
                customModelFunction({
                  buffer: correctedBuffer,
                  image: imagePath,
                  maintainFormat,
                  priorPage,
                }),
              maxRetries,
              pageNumber
            );
          } else {
            rawResponse = await runRetries(
              () =>
                modelInstance.getCompletion(OperationMode.OCR, {
                  image: correctedBuffer,
                  maintainFormat,
                  priorPage,
                }),
              maxRetries,
              pageNumber
            );
          }
          const response = CompletionProcessor.process(
            OperationMode.OCR,
            rawResponse
          );

          inputTokenCount += response.inputTokens;
          outputTokenCount += response.outputTokens;

          if (isCompletionResponse(OperationMode.OCR, response)) {
            priorPage = response.content;
          }

          page = {
            ...response,
            page: pageNumber,
            status: PageStatus.SUCCESS,
          };
          numSuccessfulOCRRequests++;
        } catch (error) {
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
          numFailedOCRRequests++;
        }

        return page;
      };

      if (maintainFormat) {
        // Use synchronous processing
        for (let i = 0; i < imagePaths.length; i++) {
          const page = await processOCR(imagePaths[i], i + 1, true);
          pages.push(page);
          if (page.status === PageStatus.ERROR) {
            break;
          }
        }
      } else {
        const limit = pLimit(concurrency);
        await Promise.all(
          imagePaths.map((imagePath, i) =>
            limit(() =>
              processOCR(imagePath, i + 1, false).then((page) => {
                pages[i] = page;
              })
            )
          )
        );
      }
    }

    // Start processing extraction using LLM
    let numSuccessfulExtractionRequests: number = 0;
    let numFailedExtractionRequests: number = 0;

    if (schema) {
      const { fullDocSchema, perPageSchema } = splitSchema(
        schema,
        extractPerPage
      );
      const extractionTasks: Promise<any>[] = [];

      const processExtraction = async (
        input: string | string[],
        pageNumber: number,
        schema: Record<string, unknown>
      ): Promise<Record<string, unknown>> => {
        let result: Record<string, unknown> = {};
        try {
          await runRetries(
            async () => {
              const rawResponse = await extractionModelInstance.getCompletion(
                OperationMode.EXTRACTION,
                {
                  input,
                  options: { correctOrientation, scheduler, trimEdges },
                  schema,
                }
              );
              const response = CompletionProcessor.process(
                OperationMode.EXTRACTION,
                rawResponse
              );

              inputTokenCount += response.inputTokens;
              outputTokenCount += response.outputTokens;

              numSuccessfulExtractionRequests++;

              for (const key of Object.keys(schema?.properties ?? {})) {
                const value = response.extracted[key];
                if (value !== null && value !== undefined) {
                  if (!Array.isArray(result[key])) {
                    result[key] = [];
                  }
                  (result[key] as any[]).push({ page: pageNumber, value });
                }
              }
            },
            maxRetries,
            pageNumber
          );
        } catch (error) {
          numFailedExtractionRequests++;
          throw error;
        }

        return result;
      };

      if (perPageSchema) {
        const inputs = extractOnly
          ? imagePaths.map((imagePath) => [imagePath])
          : pages.map((page) => page.content || "");

        extractionTasks.push(
          ...inputs.map((input, i) =>
            processExtraction(input, i + 1, perPageSchema)
          )
        );
      }

      if (fullDocSchema) {
        const input: string | string[] = extractOnly
          ? imagePaths
          : pages
              .map((page, i) =>
                i === 0 ? page.content : "\n<hr><hr>\n" + page.content
              )
              .join("");

        extractionTasks.push(
          (async () => {
            let result: Record<string, unknown> = {};
            try {
              await runRetries(
                async () => {
                  const rawResponse =
                    await extractionModelInstance.getCompletion(
                      OperationMode.EXTRACTION,
                      {
                        input,
                        options: { correctOrientation, scheduler, trimEdges },
                        schema: fullDocSchema,
                      }
                    );
                  const response = CompletionProcessor.process(
                    OperationMode.EXTRACTION,
                    rawResponse
                  );

                  inputTokenCount += response.inputTokens;
                  outputTokenCount += response.outputTokens;
                  numSuccessfulExtractionRequests++;
                  result = response.extracted;
                },
                maxRetries,
                0
              );
              return result;
            } catch (error) {
              numFailedExtractionRequests++;
              throw error;
            }
          })()
        );
      }

      const results = await Promise.all(extractionTasks);
      extracted = results.reduce((acc, result) => {
        Object.entries(result || {}).forEach(([key, value]) => {
          if (!acc[key]) {
            acc[key] = [];
          }
          if (Array.isArray(value)) {
            acc[key].push(...value);
          } else {
            acc[key] = value;
          }
        });
        return acc;
      }, {});
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
        totalPages: imagePaths.length,
        ocr: !extractOnly
          ? {
              successful: numSuccessfulOCRRequests,
              failed: numFailedOCRRequests,
            }
          : null,
        extracted: schema
          ? {
              successful: numSuccessfulExtractionRequests,
              failed: numFailedExtractionRequests,
            }
          : null,
      },
    };
  } finally {
    if (correctOrientation && scheduler) {
      terminateScheduler(scheduler);
    }
  }
};
