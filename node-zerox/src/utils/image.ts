import sharp from "sharp";
import Tesseract from "tesseract.js";

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
  const metadata = await image.metadata();
  const height = metadata.height || 0;
  const width = metadata.width || 0;

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
  const ratio = height / width;

  if (ratio > 3) {
    return await splitTallImage(correctedBuffer);
  }

  return [correctedBuffer];
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
  imageBuffer: Buffer,
  maxRatioPerSection = 3
): Promise<Buffer[]> => {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const height = metadata.height || 0;
  const width = metadata.width || 0;

  const ratio = height / width;

  if (ratio <= maxRatioPerSection) return [await image.toBuffer()];

  const numSections = Math.ceil(ratio / maxRatioPerSection);
  const sectionHeight = Math.floor(height / numSections);

  const buffers: Buffer[] = [];

  for (let i = 0; i < numSections; i++) {
    const top = i * sectionHeight;
    const heightToUse = i === numSections - 1 ? height - top : sectionHeight;

    const sectionBuffer = await sharp(imageBuffer)
      .extract({ left: 0, top, width, height: heightToUse })
      .toBuffer();

    buffers.push(sectionBuffer);
  }

  return buffers;
};
