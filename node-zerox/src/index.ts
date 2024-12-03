import os from "os";
import fs from "fs-extra";
import path from "path";
import pLimit, { Limit } from "p-limit";

import {
  convertFileToPdf,
  convertPdfToImages,
  downloadFile,
  formatMarkdown,
  isString,
} from "./utils";
import { getCompletion } from "./openAI";
import {
  ErrorMode,
  ModelOptions,
  Page,
  PageStatus,
  ZeroxArgs,
  ZeroxOutput,
} from "./types";
import { validateLLMParams } from "./utils";

export const zerox = async ({
  cleanup = true,
  concurrency = 10,
  correctOrientation = true,
  errorMode = ErrorMode.IGNORE,
  filePath,
  llmParams = {},
  maintainFormat = false,
  maxRetries = 1,
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

  // Ensure temp directory exists + create temp folder
  const rand = Math.floor(1000 + Math.random() * 9000).toString();
  const tempDirectory = path.join(tempDir || os.tmpdir(), `zerox-temp-${rand}`);
  await fs.ensureDir(tempDirectory);

  // Download the PDF. Get file name.
  const { extension, localPath } = await downloadFile({
    filePath,
    tempDir: tempDirectory,
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
        tempDir: tempDirectory,
      });
    }
    // Convert the file to a series of images
    await convertPdfToImages({
      correctOrientation,
      localPath: pdfPath,
      pagesToConvertAsImages,
      tempDir: tempDirectory,
      trimEdges,
    });
  }

  const endOfPath = localPath.split("/")[localPath.split("/").length - 1];
  const rawFileName = endOfPath.split(".")[0];
  const fileName = rawFileName
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .substring(0, 255); // Truncate file name to 255 characters to prevent ENAMETOOLONG errors

  // Get list of converted images
  const files = await fs.readdir(tempDirectory);
  const images = files.filter((file) => file.endsWith(".png"));

  // Start processing the images using LLM
  let successfulPages = 0;
  let failedPages = 0;

  if (maintainFormat) {
    // Use synchronous processing
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const imagePath = path.join(tempDirectory, image);

      let retryCount = 0;

      while (retryCount <= maxRetries) {
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

          pages.push({
            content: formattedMarkdown,
            contentLength: formattedMarkdown.length,
            page: i + 1,
            status: PageStatus.SUCCESS,
            inputTokens,
            outputTokens,
          });
          successfulPages++;
          break;
        } catch (error) {
          if (retryCount < maxRetries) {
            console.log(`Retrying page ${i + 1}...`);
            retryCount++;
            continue;
          }

          console.error(`Failed to process image ${image}:`, error);
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
          failedPages++;
          break;
        }
      }
    }
  } else {
    // Process in parallel with a limit on concurrent pages
    const processPage = async (
      image: string,
      pageNumber: number,
      retryCount = 0
    ): Promise<Page> => {
      const imagePath = path.join(tempDirectory, image);
      if (onPreProcess) {
        await onPreProcess({ imagePath, pageNumber });
      }
      let page: Page;
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

        page = {
          content: formattedMarkdown,
          contentLength: formattedMarkdown.length,
          page: pageNumber,
          status: PageStatus.SUCCESS,
          inputTokens,
          outputTokens,
        };
        successfulPages++;
      } catch (error) {
        if (retryCount <= maxRetries) {
          console.log(`Retrying page ${pageNumber}...`);
          return processPage(image, pageNumber, retryCount + 1);
        }

        console.error(`Failed to process image ${image}:`, error);
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
        failedPages++;
      }

      if (onPostProcess) {
        await onPostProcess({
          page,
          progressSummary: {
            totalPages: images.length,
            successfulPages,
            failedPages,
          },
        });
      }

      return page;
    };

    // Function to process pages with concurrency limit
    const processPagesInBatches = async (images: string[], limit: Limit) => {
      const promises = images.map((image, index) =>
        limit(() =>
          processPage(image, index + 1).then((result) => {
            pages[index] = result;
          })
        )
      );

      await Promise.all(promises);
    };

    const limit = pLimit(concurrency);
    await processPagesInBatches(images, limit);
  }

  // Write the aggregated markdown to a file
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

    // Return the page with the correct page number
    const result: Page = {
      ...page,
      page: pageNumber,
    };

    return result;
  });

  return {
    completionTime,
    fileName,
    inputTokens: inputTokenCount,
    outputTokens: outputTokenCount,
    pages: formattedPages,
    summary: {
      totalPages: formattedPages.length,
      successfulPages,
      failedPages,
    },
  };
};
