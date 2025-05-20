import { convert } from "libreoffice-convert";
import { exec } from "child_process";
import { fromPath } from "pdf2pic";
import { pipeline } from "stream/promises";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { WriteImageResponse } from "pdf2pic/dist/types/convertResponse";
import axios from "axios";
import fileType from "file-type";
import fs from "fs-extra";
import heicConvert from "heic-convert";
import mime from "mime-types";
import path from "path";
import pdf from "pdf-parse";
import util from "util";
import xlsx from "xlsx";

import { ASPECT_RATIO_THRESHOLD } from "../constants";
import {
  ConvertPdfOptions,
  ExcelSheetContent,
  Page,
  PageStatus,
} from "../types";
import { isValidUrl } from "./common";

const convertAsync = promisify(convert);

const execAsync = util.promisify(exec);

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

// Check if file is a Compound File Binary (legacy Office format)
export const checkIsCFBFile = async (filePath: string): Promise<boolean> => {
  const type = await fileType.fromFile(filePath);
  return type?.mime === "application/x-cfb";
};

// Check if file is a PDF by inspecting its magic number ("%PDF" at the beginning)
export const checkIsPdfFile = async (filePath: string): Promise<boolean> => {
  const buffer = await fs.readFile(filePath);
  return buffer.subarray(0, 4).toString() === "%PDF";
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
  imageFormat = "png",
  imageHeight = 2048,
  pagesToConvertAsImages,
  pdfPath,
  tempDir,
}: {
  imageDensity?: number;
  imageFormat?: "png" | "jpeg";
  imageHeight?: number;
  pagesToConvertAsImages: number | number[];
  pdfPath: string;
  tempDir: string;
}): Promise<string[]> => {
  const aspectRatio = (await getPdfAspectRatio(pdfPath)) || 1;
  const shouldAdjustHeight = aspectRatio > ASPECT_RATIO_THRESHOLD;
  const adjustedHeight = shouldAdjustHeight
    ? Math.max(imageHeight, Math.round(aspectRatio * imageHeight))
    : imageHeight;

  const options: ConvertPdfOptions = {
    density: imageDensity,
    format: imageFormat,
    height: adjustedHeight,
    preserveAspectRatio: true,
    saveFilename: path.basename(pdfPath, path.extname(pdfPath)),
    savePath: tempDir,
  };

  try {
    try {
      const storeAsImage = fromPath(pdfPath, options);
      const convertResults: WriteImageResponse[] = await storeAsImage.bulk(
        pagesToConvertAsImages
      );
      // Validate that all pages were converted
      return convertResults.map((result) => {
        if (!result.page || !result.path) {
          throw new Error("Could not identify page data");
        }
        return result.path;
      });
    } catch (err) {
      return await convertPdfWithPoppler(
        pagesToConvertAsImages,
        pdfPath,
        options
      );
    }
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

// Alternative PDF to PNG conversion using Poppler
const convertPdfWithPoppler = async (
  pagesToConvertAsImages: number | number[],
  pdfPath: string,
  options: ConvertPdfOptions
): Promise<string[]> => {
  const { density, format, height, saveFilename, savePath } = options;
  const outputPrefix = path.join(savePath, saveFilename);

  const run = async (from?: number, to?: number) => {
    const pageArgs = from && to ? `-f ${from} -l ${to}` : "";
    const cmd = `pdftoppm -${format} -r ${density} -scale-to-y ${height} -scale-to-x -1 ${pageArgs} "${pdfPath}" "${outputPrefix}"`;
    await execAsync(cmd);
  };

  if (pagesToConvertAsImages === -1) {
    await run();
  } else if (typeof pagesToConvertAsImages === "number") {
    await run(pagesToConvertAsImages, pagesToConvertAsImages);
  } else if (Array.isArray(pagesToConvertAsImages)) {
    await Promise.all(pagesToConvertAsImages.map((page) => run(page, page)));
  }

  const convertResults = await fs.readdir(savePath);
  return convertResults
    .filter(
      (result) =>
        result.startsWith(saveFilename) && result.endsWith(`.${format}`)
    )
    .map((result) => path.join(savePath, result));
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

// Gets the aspect ratio (height/width) of a PDF
const getPdfAspectRatio = async (
  pdfPath: string
): Promise<number | undefined> => {
  return new Promise((resolve) => {
    exec(`pdfinfo "${pdfPath}"`, (error, stdout) => {
      if (error) return resolve(undefined);

      const sizeMatch = stdout.match(/Page size:\s+([\d.]+)\s+x\s+([\d.]+)/);
      if (sizeMatch) {
        const height = parseFloat(sizeMatch[2]);
        const width = parseFloat(sizeMatch[1]);
        return resolve(height / width);
      }

      resolve(undefined);
    });
  });
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
