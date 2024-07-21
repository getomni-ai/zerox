import os from "os";
import fs from "fs-extra";
import path from "path";
import { getCompletion } from "./openAI";
import { convertPdfToImages, downloadFile, formatMarkdown } from "./utils";
import { ZeroxArgs } from "./types";

export const zerox = async ({
  cleanup = true,
  concurrency = 10,
  filePath,
  maintainFormat = false,
  openaiAPIKey,
  outputDir,
  tempDir = os.tmpdir(),
}: ZeroxArgs) => {
  let priorPage = "";
  let inputTokenCount = 0;
  let outputTokenCount = 0;
  const aggregatedMarkdown: string[] = [];
  const startTime = new Date();

  // Ensure the output directory exists
  if (outputDir) await fs.ensureDir(outputDir);
  const tempDirectory = path.join(tempDir || os.tmpdir(), "your-app-temp");
  await fs.ensureDir(tempDirectory);

  // Download the PDF. Get file name.
  const localPath = await downloadFile({ filePath, tempDir: tempDirectory });
  if (!localPath) throw "Failed to save file to local drive";
  const endOfPath = localPath.split("/")[localPath.split("/").length - 1];
  const rawFileName = endOfPath.split(".")[0];
  const fileName = rawFileName
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .toLowerCase();

  // Convert the file to a series of images
  await convertPdfToImages({ localPath, tempDir: tempDirectory });

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
          maintainFormat,
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
    const processPage = async (image: string) => {
      const imagePath = path.join(tempDirectory, image);
      try {
        const { content, inputTokens, outputTokens } = await getCompletion({
          apiKey: openaiAPIKey,
          imagePath,
          maintainFormat,
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
    const processPagesInBatches = async (images: string[], limit: number) => {
      const results: any[] = [];
      const executing: any[] = [];

      for (const image of images) {
        const p = processPage(image).then((result) => {
          results.push(result);
        });
        executing.push(p);

        if (executing.length >= limit) {
          await Promise.race(executing);
          executing.splice(executing.indexOf(p), 1);
        }
      }

      await Promise.all(executing);
      return results;
    };

    const results = await processPagesInBatches(images, concurrency);
    aggregatedMarkdown.push(...results.filter((result) => result !== null));
  }

  // Write the aggregated markdown to a file
  if (outputDir) {
    const resultFilePath = path.join(outputDir, `${fileName}.md`);
    await fs.writeFile(resultFilePath, aggregatedMarkdown.join("\n\n"));
  }

  // Cleanup the downloaded PDF file
  if (cleanup) await fs.emptyDir(tempDirectory);

  // Format JSON response
  const endTime = new Date();
  const completionTime = endTime.getTime() - startTime.getTime();
  const formattedPages = aggregatedMarkdown.map((el, i) => {
    return { text: el, page: i + 1, contentLength: el.length };
  });

  return {
    completionTime,
    fileName,
    inputTokens: inputTokenCount,
    outputTokens: outputTokenCount,
    pages: formattedPages,
  };
};
