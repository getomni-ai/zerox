import { fromPath } from "pdf2pic";
import { pipeline } from "stream/promises";
import axios from "axios";
import fs from "fs-extra";
import mime from "mime-types";
import path from "path";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { convert } from "libreoffice-convert";
import { WriteImageResponse } from "pdf2pic/dist/types/convertResponse";

import { isValidUrl } from "./common";

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

// Convert each page to a png and save that image to tempDir
export const convertPdfToImages = async ({
  pdfPath,
  pagesToConvertAsImages,
  tempDir,
}: {
  pdfPath: string;
  pagesToConvertAsImages: number | number[];
  tempDir: string;
}): Promise<string[]> => {
  const options = {
    density: 300,
    format: "png",
    height: 2048,
    preserveAspectRatio: true,
    saveFilename: path.basename(pdfPath, path.extname(pdfPath)),
    savePath: tempDir,
  };
  const storeAsImage = fromPath(pdfPath, options);

  try {
    const convertResults: WriteImageResponse[] = await storeAsImage.bulk(
      pagesToConvertAsImages
    );

    // validate that all pages were converted
    let imagePaths: string[] = [];
    convertResults.forEach((result) => {
      if (!result.page || !result.path) {
        throw new Error("Could not identify page data");
      }
      imagePaths.push(result.path);
    });

    return imagePaths;
  } catch (err) {
    console.error("Error during PDF conversion:", err);
    throw err;
  }
};
