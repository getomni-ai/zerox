import fs from "fs-extra";
import os from "os";
import path from "path";
import pLimit from "p-limit";
import Tesseract from "tesseract.js";

import "./handleWarnings";
import {
  addWorkersToTesseractScheduler,
  checkIsCFBFile,
  checkIsPdfFile,
  cleanupImage,
  CompletionProcessor,
  compressImage,
  convertFileToPdf,
  convertHeicToJpeg,
  convertPdfToImages,
  downloadFile,
  extractPagesFromStructuredDataFile,
  getNumberOfPagesFromPdf,
  getTesseractScheduler,
  isCompletionResponse,
  isStructuredDataFile,
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
  HybridInput,
  LogprobPage,
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
  directImageExtraction = false,
  enableHybridExtraction = false,
  errorMode = ErrorMode.IGNORE,
  extractionCredentials,
  extractionLlmParams,
  extractionModel,
  extractionModelProvider,
  extractionPrompt,
  extractOnly = false,
  extractPerPage,
  filePath,
  imageDensity,
  imageHeight,
  llmParams = {},
  maintainFormat = false,
  maxImageSize = 15,
  maxRetries = 1,
  maxTesseractWorkers = -1,
  model = ModelOptions.OPENAI_GPT_4O,
  modelProvider = ModelProvider.OPENAI,
  openaiAPIKey = "",
  outputDir,
  pagesToConvertAsImages = -1,
  prompt,
  schema,
  tempDir = os.tmpdir(),
  trimEdges = true,
}: ZeroxArgs): Promise<ZeroxOutput> => {
  let extracted: Record<string, unknown> | null = null;
  let extractedLogprobs: LogprobPage[] = [];
  let inputTokenCount: number = 0;
  let outputTokenCount: number = 0;
  let numSuccessfulOCRRequests: number = 0;
  let numFailedOCRRequests: number = 0;
  let ocrLogprobs: LogprobPage[] = [];
  let priorPage: string = "";
  let pages: Page[] = [];
  let imagePaths: string[] = [];
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
  if (enableHybridExtraction && (directImageExtraction || extractOnly)) {
    throw new Error(
      "Hybrid extraction cannot be used in direct image extraction or extract-only mode"
    );
  }
  if (enableHybridExtraction && !schema) {
    throw new Error("Schema is required when hybrid extraction is enabled");
  }
  if (extractOnly && !schema) {
    throw new Error("Schema is required for extraction mode");
  }
  if (extractOnly && maintainFormat) {
    throw new Error("Maintain format is only supported in OCR mode");
  }

  if (extractOnly) directImageExtraction = true;

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

    // Check if the file is a structured data file (like Excel).
    // If so, skip the image conversion process and extract the pages directly
    if (isStructuredDataFile(localPath)) {
      pages = await extractPagesFromStructuredDataFile(localPath);
    } else {
      // Read the image file or convert the file to images
      if (
        extension === ".png" ||
        extension === ".jpg" ||
        extension === ".jpeg"
      ) {
        imagePaths = [localPath];
      } else if (extension === ".heic") {
        const imagePath = await convertHeicToJpeg({
          localPath,
          tempDir: sourceDirectory,
        });
        imagePaths = [imagePath];
      } else {
        let pdfPath: string;
        const isCFBFile = await checkIsCFBFile(localPath);
        const isPdf = await checkIsPdfFile(localPath);
        if ((extension === ".pdf" || isPdf) && !isCFBFile) {
          pdfPath = localPath;
        } else {
          // Convert file to PDF if necessary
          pdfPath = await convertFileToPdf({
            extension,
            localPath,
            tempDir: sourceDirectory,
          });
        }
        if (pagesToConvertAsImages !== -1) {
          const totalPages = await getNumberOfPagesFromPdf({ pdfPath });
          pagesToConvertAsImages = Array.isArray(pagesToConvertAsImages)
            ? pagesToConvertAsImages
            : [pagesToConvertAsImages];
          pagesToConvertAsImages = pagesToConvertAsImages.filter(
            (page) => page > 0 && page <= totalPages
          );
        }
        imagePaths = await convertPdfToImages({
          imageDensity,
          imageHeight,
          pagesToConvertAsImages,
          pdfPath,
          tempDir: sourceDirectory,
        });
      }

      // Compress images if maxImageSize is specified
      if (maxImageSize && maxImageSize > 0) {
        const compressPromises = imagePaths.map(async (imagePath: string) => {
          const imageBuffer = await fs.readFile(imagePath);
          const compressedBuffer = await compressImage(
            imageBuffer,
            maxImageSize
          );
          const originalName = path.basename(
            imagePath,
            path.extname(imagePath)
          );
          const compressedPath = path.join(
            sourceDirectory,
            `${originalName}_compressed.png`
          );
          await fs.writeFile(compressedPath, compressedBuffer);
          return compressedPath;
        });

        imagePaths = await Promise.all(compressPromises);
      }

      if (correctOrientation) {
        await prepareWorkersForImageProcessing({
          maxTesseractWorkers,
          numImages: imagePaths.length,
          scheduler,
        });
      }

      // Start processing OCR using LLM
      const modelInstance = createModel({
        credentials,
        llmParams,
        model,
        provider: modelProvider,
      });

      if (!extractOnly) {
        const processOCR = async (
          imagePath: string,
          pageIndex: number,
          maintainFormat: boolean
        ): Promise<Page> => {
          let pageNumber: number;
          // If we convert all pages, just use the array index
          if (pagesToConvertAsImages === -1) {
            pageNumber = pageIndex + 1;
          }
          // Else if we convert specific pages, use the page number from the parameter
          else if (Array.isArray(pagesToConvertAsImages)) {
            pageNumber = pagesToConvertAsImages[pageIndex];
          }
          // Else, the parameter is a number and use it for the page number
          else {
            pageNumber = pagesToConvertAsImages;
          }

          const imageBuffer = await fs.readFile(imagePath);
          const buffers = await cleanupImage({
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
                    buffers,
                    image: imagePath,
                    maintainFormat,
                    pageNumber,
                    priorPage,
                  }),
                maxRetries,
                pageNumber
              );
            } else {
              rawResponse = await runRetries(
                () =>
                  modelInstance.getCompletion(OperationMode.OCR, {
                    buffers,
                    maintainFormat,
                    priorPage,
                    prompt,
                  }),
                maxRetries,
                pageNumber
              );
            }

            if (rawResponse.logprobs) {
              ocrLogprobs.push({
                page: pageNumber,
                value: rawResponse.logprobs,
              });
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
            const page = await processOCR(imagePaths[i], i, true);
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
                processOCR(imagePath, i, false).then((page) => {
                  pages[i] = page;
                })
              )
            )
          );
        }
      }
    }

    // Start processing extraction using LLM
    let numSuccessfulExtractionRequests: number = 0;
    let numFailedExtractionRequests: number = 0;

    if (schema) {
      const extractionModelInstance = createModel({
        credentials: extractionCredentials,
        llmParams: extractionLlmParams,
        model: extractionModel,
        provider: extractionModelProvider,
      });

      const { fullDocSchema, perPageSchema } = splitSchema(
        schema,
        extractPerPage
      );
      const extractionTasks: Promise<any>[] = [];

      const processExtraction = async (
        input: string | string[] | HybridInput,
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
                  prompt: extractionPrompt,
                  schema,
                }
              );

              if (rawResponse.logprobs) {
                extractedLogprobs.push({
                  page: pageNumber,
                  value: rawResponse.logprobs,
                });
              }

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
        const inputs =
          directImageExtraction && !isStructuredDataFile(localPath)
            ? imagePaths.map((imagePath) => [imagePath])
            : enableHybridExtraction
            ? imagePaths.map((imagePath, index) => ({
                imagePaths: [imagePath],
                text: pages[index].content || "",
              }))
            : pages.map((page) => page.content || "");

        extractionTasks.push(
          ...inputs.map((input, i) =>
            processExtraction(input, i + 1, perPageSchema)
          )
        );
      }

      if (fullDocSchema) {
        const input =
          directImageExtraction && !isStructuredDataFile(localPath)
            ? imagePaths
            : enableHybridExtraction
            ? {
                imagePaths,
                text: pages
                  .map((page, i) =>
                    i === 0 ? page.content : "\n<hr><hr>\n" + page.content
                  )
                  .join(""),
              }
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
                        prompt: extractionPrompt,
                        schema: fullDocSchema,
                      }
                    );

                  if (rawResponse.logprobs) {
                    extractedLogprobs.push({
                      page: null,
                      value: rawResponse.logprobs,
                    });
                  }

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

    return {
      completionTime,
      extracted,
      fileName,
      inputTokens: inputTokenCount,
      ...(ocrLogprobs.length || extractedLogprobs.length
        ? {
            logprobs: {
              ocr: !extractOnly ? ocrLogprobs : null,
              extracted: schema ? extractedLogprobs : null,
            },
          }
        : {}),
      outputTokens: outputTokenCount,
      pages,
      summary: {
        totalPages: pages.length,
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
