import * as cv from "@u4/opencv4nodejs";
import sharp from "sharp";
import Tesseract from "tesseract.js";

import { ASPECT_RATIO_THRESHOLD } from "../constants";

interface CleanupImageProps {
  correctOrientation: boolean;
  imageBuffer: Buffer;
  scheduler: Tesseract.Scheduler | null;
  trimEdges: boolean;
}

export const encodeImageToBase64 = (imageBuffer: Buffer) => {
  return imageBuffer.toString("base64");
};

export const cleanupImage = async ({
  correctOrientation,
  imageBuffer,
  scheduler,
  trimEdges,
}: CleanupImageProps): Promise<Buffer[]> => {
  const image = sharp(imageBuffer);

  // Trim extra space around the content in the image
  if (trimEdges) {
    image.trim();
  }

  // scheduler would always be non-null if correctOrientation is true
  // Adding this check to satisfy typescript
  if (correctOrientation && scheduler) {
    const optimalRotation = await determineOptimalRotation({
      image,
      scheduler,
    });

    if (optimalRotation) {
      image.rotate(optimalRotation);
    }
  }

  // Correct the image orientation
  const correctedBuffer = await image.toBuffer();

  return await splitTallImage(correctedBuffer);
};

// Determine the optimal image orientation based on OCR confidence
// Run Tesseract on 4 image orientations and compare the outputs
const determineOptimalRotation = async ({
  image,
  scheduler,
}: {
  image: sharp.Sharp;
  scheduler: Tesseract.Scheduler;
}): Promise<number> => {
  const imageBuffer = await image.toBuffer();
  const {
    data: { orientation_confidence, orientation_degrees },
  } = await scheduler.addJob("detect", imageBuffer);

  if (orientation_degrees) {
    console.log(
      `Reorienting image ${orientation_degrees} degrees (confidence: ${orientation_confidence}%)`
    );
    return orientation_degrees;
  }
  return 0;
};

/**
 * Compress an image to a maximum size
 * @param image - The image to compress as a buffer
 * @param maxSize - The maximum size in MB
 * @returns The compressed image as a buffer
 */
export const compressImage = async (
  image: Buffer,
  maxSize: number
): Promise<Buffer> => {
  if (maxSize <= 0) {
    throw new Error("maxSize must be greater than 0");
  }

  // Convert maxSize from MB to bytes
  const maxBytes = maxSize * 1024 * 1024;

  if (image.length <= maxBytes) {
    return image;
  }

  try {
    // Start with quality 90 and gradually decrease if needed
    let quality = 90;
    let compressedImage: Buffer;

    do {
      compressedImage = await sharp(image).jpeg({ quality }).toBuffer();

      quality -= 10;

      if (quality < 20) {
        throw new Error(
          `Unable to compress image to ${maxSize}MB while maintaining acceptable quality.`
        );
      }
    } while (compressedImage.length > maxBytes);

    return compressedImage;
  } catch (error) {
    return image;
  }
};

export const splitTallImage = async (
  imageBuffer: Buffer
): Promise<Buffer[]> => {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const height = metadata.height || 0;
  const width = metadata.width || 0;
  const aspectRatio = height / width;

  if (aspectRatio <= ASPECT_RATIO_THRESHOLD) {
    return [await image.toBuffer()];
  }

  const cvImg = cv.imdecode(imageBuffer);
  const edges = cvImg.cvtColor(cv.COLOR_BGR2GRAY).canny(50, 150);

  const edgeDensity = new Array(height);
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += edges.at(y, x);
    }
    edgeDensity[y] = rowSum;
  }

  const numSections = Math.ceil(aspectRatio);
  const approxSectionHeight = Math.floor(height / numSections);
  const splitPoints = [0];

  for (let i = 1; i < numSections; i++) {
    const targetY = i * approxSectionHeight;

    const windowSize = Math.min(100, approxSectionHeight / 4);
    const searchStart = Math.max(targetY - windowSize, splitPoints[i - 1] + 50);
    const searchEnd = Math.min(targetY + windowSize, height - 50);

    let bestY = targetY;
    let minEdgeValue = Infinity;

    for (let y = searchStart; y <= searchEnd; y++) {
      if (edgeDensity[y] < minEdgeValue) {
        minEdgeValue = edgeDensity[y];
        bestY = y;
      }
    }

    splitPoints.push(bestY);
  }

  splitPoints.push(height);

  return Promise.all(
    splitPoints.slice(0, -1).map((top, i) => {
      const sectionHeight = splitPoints[i + 1] - top;
      return sharp(imageBuffer)
        .extract({ left: 0, top, width, height: sectionHeight })
        .toBuffer();
    })
  );
};
