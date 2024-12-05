import dotenv from "dotenv";
import path from "node:path";

import { zerox } from "../src";
import { ErrorMode, ModelOptions } from "../src/types";

dotenv.config({ path: path.join(__dirname, "../.env") });

const filePath = path.join(__dirname, "data", "100-pages.pdf");
const OUTPUT_DIR = path.join(__dirname, "results", `test-run-${Date.now()}`);

async function runOCR() {
  console.log("OCR STARTED");
  const startTime = Date.now();
  const ocrResult = await zerox({
    cleanup: false,
    concurrency: 100,
    filePath,
    maintainFormat: false,
    model: ModelOptions.gpt_4o,
    // errorMode: ErrorMode.THROW,
    openaiAPIKey: process.env.OPENAI_API_KEY,
    // pagesToConvertAsImages: [3, 4],
    onPostProcess: async ({ page, progressSummary }) => {
      //   console.log("--------------------------------");
      console.log("page.page", page.page);
      //   console.log(page);
      //   console.log(progressSummary);
      //   console.log("--------------------------------");
    },
  });

  console.log("OCR COMPLETED");
  console.log(ocrResult);
  console.log("OCR TIME", `${(Date.now() - startTime) / 1000}s`);
}

runOCR().catch(console.error);
