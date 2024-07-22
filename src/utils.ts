import axios from "axios";
import fs from "fs-extra";
import path from "path";
import { fromPath } from "pdf2pic";
import { pipeline } from "stream/promises";

export const encodeImageToBase64 = async (imagePath: string) => {
  const imageBuffer = await fs.readFile(imagePath);
  return imageBuffer.toString("base64");
};

// Strip out the ```markdown wrapper
export const formatMarkdown = (text: string) => {
  const formattedMarkdown = text
    .replace(/^```[a-z]*\n([\s\S]*?)\n```$/g, "$1")
    .replace(/^```\n([\s\S]*?)\n```$/g, "$1");
  return formattedMarkdown;
};

// Save file to local tmp directory
export const downloadFile = async ({
  filePath,
  tempDir,
}: {
  filePath: string;
  tempDir: string;
}): Promise<string | void> => {
  const localPdfPath = path.join(tempDir, path.basename(filePath));
  const writer = fs.createWriteStream(localPdfPath);

  const response = await axios({
    url: filePath,
    method: "GET",
    responseType: "stream",
  });

  if (response.status !== 200) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }
  await pipeline(response.data, writer);

  return localPdfPath;
};

// Convert each page to a png and save that image to tmp
// @TODO: pull dimensions from the original document. Also, look into rotated pages
export const convertPdfToImages = async ({
  localPath,
  tempDir,
}: {
  localPath: string;
  tempDir: string;
}) => {
  const options = {
    density: 300,
    format: "png",
    height: 1056,
    preserveAspectRatio: true,
    saveFilename: path.basename(localPath, path.extname(localPath)),
    savePath: tempDir,
  };
  const storeAsImage = fromPath(localPath, options);

  try {
    const convertResults = await storeAsImage.bulk(-1, {
      responseType: "buffer",
    });
    await Promise.all(
      convertResults.map(async (result) => {
        if (!result || !result.buffer) {
          throw new Error("Could not convert page to image buffer");
        }
        const imagePath = path.join(
          tempDir,
          `${options.saveFilename}_page_${result.page}.png`
        );
        await fs.writeFile(imagePath, result.buffer);
      })
    );
    return convertResults;
  } catch (err) {
    console.error("Error during PDF conversion:", err);
  }
};
