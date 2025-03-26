import { convert } from "libreoffice-convert";
import { exec } from "child_process";
import { fromPath } from "pdf2pic";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import fs from "fs-extra";
import heicConvert from "heic-convert";
import mime from "mime-types";
import path from "path";
import pdf from "pdf-parse";
import xlsx from "xlsx";

import { isValidUrl } from "./common";
import { ExcelSheetContent, Page, PageStatus } from "../types";

const convertAsync = promisify(convert);

const execPromise = promisify(exec);

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

  let extension = mime.extension(mimetype);
  if (!extension) {
    extension = fileNameExt || "";
  }

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
  imageDensity?: number;
  imageHeight?: number;
  pdfPath: string;
  pagesToConvertAsImages: number | number[];
  tempDir: string;
}): Promise<string[]> => {
  const baseFilename = path.basename(pdfPath, path.extname(pdfPath));
  const pageDimensions = await getPdfPageDimensions(pdfPath);
  const totalPages = pageDimensions?.length ?? 0;

  const pageNumbers =
    pagesToConvertAsImages === -1
      ? Array.from({ length: totalPages }, (_, i) => i + 1)
      : Array.isArray(pagesToConvertAsImages)
      ? pagesToConvertAsImages
      : [pagesToConvertAsImages];

  const convertPagePromises = pageNumbers.map(async (page) => {
    const pageIndex = page - 1;
    const dimensions = pageDimensions?.[pageIndex];
    const ratio = dimensions ? dimensions.height / dimensions.width : 1;
    const adjustedHeight = Math.max(
      imageHeight,
      Math.round(imageHeight * ratio)
    );
    const options = {
      density: imageDensity,
      format: "png",
      height: adjustedHeight,
      preserveAspectRatio: true,
      saveFilename: baseFilename,
      savePath: tempDir,
    };
    const storeAsImage = fromPath(pdfPath, options);

    const result = await storeAsImage(page);
    if (!result.page || !result.path) {
      throw new Error("Could not identify page data");
    }

    return result.path;
  });

  let outputPaths: string[] = [];
  try {
    outputPaths = await Promise.all(convertPagePromises);
  } catch (err) {
    console.error("Error during PDF conversion:", err);
    throw err;
  }

  return outputPaths;
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

      const jsonData = xlsx.utils.sheet_to_json<any[]>(worksheet, {
        header: 1,
      });

      let sheetContent = "";
      sheetContent += `<h2>Sheet: ${sheetName}</h2>`;

      sheetContent += `<table class="${tableClass}">`;

      if (jsonData.length > 0) {
        jsonData.forEach((row: any[], rowIndex: number) => {
          sheetContent += "<tr>";

          const cellTag = rowIndex === 0 ? "th" : "td";

          if (row && row.length > 0) {
            row.forEach((cell) => {
              const cellContent =
                cell !== null && cell !== undefined ? cell.toString() : "";

              sheetContent += `<${cellTag}>${cellContent}</${cellTag}>`;
            });
          }

          sheetContent += "</tr>";
        });
      }

      sheetContent += "</table>";

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

// Gets the number of pages from a PDF
export const getNumberOfPagesFromPdf = async ({
  pdfPath,
}: {
  pdfPath: string;
}): Promise<number> => {
  const dataBuffer = await fs.readFile(pdfPath);
  const data = await pdf(dataBuffer);
  return data.numpages;
};

// Gets the height and width of each page in the PDF
const getPdfPageDimensions = async (
  pdfPath: string
): Promise<{ height: number; width: number }[] | undefined> => {
  try {
    const { stdout: infoOut } = await execPromise(`pdfinfo "${pdfPath}"`);
    const pageCountMatch = infoOut.match(/Pages:\s+(\d+)/);
    if (!pageCountMatch) {
      return undefined;
    }

    const totalPages = parseInt(pageCountMatch[1], 10);
    const dimensions: { height: number; width: number }[] = [];
    const DEFAULT_DIMENSIONS = { height: 792, width: 612 };

    for (let page = 1; page <= totalPages; page++) {
      const { stdout } = await execPromise(
        `pdfinfo -f ${page} -l ${page} "${pdfPath}"`
      );
      const sizeMatch = stdout.match(
        /Page\s+\d+\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/
      );

      if (sizeMatch) {
        dimensions.push({
          height: parseFloat(sizeMatch[2]),
          width: parseFloat(sizeMatch[1]),
        });
      } else {
        dimensions.push(DEFAULT_DIMENSIONS);
      }
    }

    return dimensions;
  } catch (error) {
    console.error("Error getting PDF dimensions:", error);
    return undefined;
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
