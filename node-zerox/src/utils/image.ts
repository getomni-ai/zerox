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

  const { data: imageData } = await image
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const emptySpaces = new Array(height).fill(0);

  // Analyze each row to find empty spaces
  for (let y = 0; y < height; y++) {
    let emptyPixels = 0;
    for (let x = 0; x < width; x++) {
      const pixelIndex = y * width + x;
      if (imageData[pixelIndex] > 230) {
        emptyPixels++;
      }
    }
    // Calculate percentage of empty pixels in this row
    const emptyRatio = emptyPixels / width;
    // Mark rows that are mostly empty (whitespace)
    emptySpaces[y] = emptyRatio > 0.95 ? 1 : 0;
  }

  const significantEmptySpaces = [];
  let currentEmptyStart = -1;

  for (let y = 0; y < height; y++) {
    if (emptySpaces[y] === 1) {
      if (currentEmptyStart === -1) {
        currentEmptyStart = y;
      }
    } else {
      if (currentEmptyStart !== -1) {
        const emptyHeight = y - currentEmptyStart;
        if (emptyHeight >= 5) {
          // Minimum height for a significant empty space
          significantEmptySpaces.push({
            center: Math.floor(currentEmptyStart + emptyHeight / 2),
            end: y - 1,
            height: emptyHeight,
            start: currentEmptyStart,
          });
        }
        currentEmptyStart = -1;
      }
    }
  }

  // Handle if there's an empty space at the end
  if (currentEmptyStart !== -1) {
    const emptyHeight = height - currentEmptyStart;
    if (emptyHeight >= 5) {
      significantEmptySpaces.push({
        center: Math.floor(currentEmptyStart + emptyHeight / 2),
        end: height - 1,
        height: emptyHeight,
        start: currentEmptyStart,
      });
    }
  }

  const numSections = Math.ceil(aspectRatio);
  const approxSectionHeight = Math.floor(height / numSections);
  const splitPoints = [0];

  for (let i = 1; i < numSections; i++) {
    const targetY = i * approxSectionHeight;

    // Find empty spaces near the target position
    const searchRadius = Math.min(150, approxSectionHeight / 3);
    const nearbyEmptySpaces = significantEmptySpaces.filter(
      (space) =>
        Math.abs(space.center - targetY) < searchRadius &&
        space.start > splitPoints[splitPoints.length - 1] + 50
    );

    if (nearbyEmptySpaces.length > 0) {
      // Sort by proximity to target
      nearbyEmptySpaces.sort(
        (a, b) => Math.abs(a.center - targetY) - Math.abs(b.center - targetY)
      );

      // Choose center of the best empty space
      splitPoints.push(nearbyEmptySpaces[0].center);
    } else {
      // Fallback if no good empty spaces found
      const minY = splitPoints[splitPoints.length - 1] + 50;
      const maxY = Math.min(height - 50, targetY + searchRadius);
      splitPoints.push(Math.max(minY, Math.min(maxY, targetY)));
    }
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
