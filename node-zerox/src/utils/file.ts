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
import heicConvert from "heic-convert";
import xlsx from "xlsx";

import { isValidUrl } from "./common";
import { ExcelSheetContent, Page, PageStatus } from "../types";

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

// Convert HEIC file to JPEG
export const convertHeicToJpeg = async ({
  localPath,
  tempDir,
}: {
  localPath: string;
  tempDir: string;
}): Promise<string> => {
  try {
    const inputBuffer = await fs.readFile(localPath);
    const outputBuffer = await heicConvert({
      buffer: inputBuffer,
      format: "JPEG",
      quality: 1,
    });

    const jpegPath = path.join(
      tempDir,
      `${path.basename(localPath, ".heic")}.jpg`
    );
    await fs.writeFile(jpegPath, Buffer.from(outputBuffer));
    return jpegPath;
  } catch (err) {
    console.error(`Error converting .heic to .jpeg:`, err);
    throw err;
  }
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
  imageDensity = 300,
  imageHeight = 2048,
  pdfPath,
  pagesToConvertAsImages,
  tempDir,
}: {
  imageDensity: number;
  imageHeight: number;
  pdfPath: string;
  pagesToConvertAsImages: number | number[];
  tempDir: string;
}): Promise<string[]> => {
  const options = {
    density: imageDensity,
    format: "png",
    height: imageHeight,
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

// Converts an Excel file to HTML format
export const convertExcelToHtml = async (
  filePath: string
): Promise<ExcelSheetContent[]> => {
  const tableClass = "zerox-excel-table";

  try {
    if (!(await fs.pathExists(filePath))) {
      throw new Error(`Excel file not found: ${filePath}`);
    }

    const workbook = xlsx.readFile(filePath, {
      type: "file",
      cellStyles: true,
      cellHTML: true,
    });

    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("Invalid Excel file or no sheets found");
    }

    const sheets: ExcelSheetContent[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];

      let sheetContent = "";
      sheetContent += `<h2>Sheet: ${sheetName}</h2>\n`;

      const sheetHtml = xlsx.utils.sheet_to_html(worksheet, {
        id: `sheet-${sheetName.replace(/[^a-zA-Z0-9]/g, "-")}`,
        editable: false,
      });

      let processedHtml = sheetHtml.replace(
        "<table",
        `<table class="${tableClass}"`
      );
      sheetContent += processedHtml;

      sheets.push({
        sheetName,
        content: sheetContent,
        contentLength: sheetContent.length,
      });
    }

    return sheets;
  } catch (error) {
    throw error;
  }
};

// Checks if a file is an Excel file
export const isExcelFile = (filePath: string): boolean => {
  const extension = path.extname(filePath).toLowerCase();
  return (
    extension === ".xlsx" ||
    extension === ".xls" ||
    extension === ".xlsm" ||
    extension === ".xlsb"
  );
};

// Checks if a file is a structured data file (like Excel)
export const isStructuredDataFile = (filePath: string): boolean => {
  return isExcelFile(filePath);
};

// Extracts pages from a structured data file (like Excel)
export const extractPagesFromStructuredDataFile = async (
  filePath: string
): Promise<Page[]> => {
  if (isExcelFile(filePath)) {
    const sheets = await convertExcelToHtml(filePath);
    const pages: Page[] = [];
    sheets.forEach((sheet: ExcelSheetContent, index: number) => {
      pages.push({
        content: sheet.content,
        contentLength: sheet.contentLength,
        page: index + 1,
        status: PageStatus.SUCCESS,
      });
    });
    return pages;
  }

  return [];
};
