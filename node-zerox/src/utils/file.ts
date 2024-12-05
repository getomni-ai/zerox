import { fromPath } from "pdf2pic";
import { pipeline } from "stream/promises";
import * as Tesseract from "tesseract.js";
import axios from "axios";
import fs from "fs-extra";
import mime from "mime-types";
import path from "path";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { convert } from "libreoffice-convert";

import { isValidUrl } from "./common";
import { addWorkersToTesseractScheduler } from "./tesseract";
import { NUM_STARTING_WORKERS } from "../constants";
import { cleanupImage } from "./image";

const convertAsync = promisify(convert);

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
