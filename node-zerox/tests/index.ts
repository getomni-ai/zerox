import { compareKeywords } from "./utils";
import { ModelOptions } from "../src/types";
import { zerox } from "../src";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pLimit from "p-limit";
import { markdownToJson } from "../src/utils";

dotenv.config({ path: path.join(__dirname, "../.env") });

interface TestInput {
  expectedKeywords: string[][];
  file: string;
}

const FILE_CONCURRENCY = 10;
const INPUT_DIR = path.join(__dirname, "../../shared/inputs");
const TEST_JSON_PATH = path.join(__dirname, "../../shared/test.json");
const OUTPUT_DIR = path.join(__dirname, "results", `test-run-${Date.now()}`);
const TEMP_DIR = path.join(OUTPUT_DIR, "temp");

function getInputs() {
  const files = fs.readdirSync(INPUT_DIR);

  const fileIdentifier = (name: string) => parseInt(name.split("_png")[0]);

  // Filter out files (ignoring directories)
  const fileNames = files
    .filter((file) => {
      return (
        fs.statSync(path.join(INPUT_DIR, file)).isFile() && file !== ".DS_Store"
      );
    })
    .map((name) => ({ file: name, expectedKeywords: [[]] }));

  return fileNames.sort(
    (a, b) => fileIdentifier(a.file) - fileIdentifier(b.file)
  );
}

async function main() {
  // Copy and paste the result into test.json
  // console.log("--->", JSON.stringify(getInputs()));
  // return;

  const T1 = new Date();

  // Read the test inputs and expected keywords
  const testInputs: TestInput[] = JSON.parse(
    fs.readFileSync(TEST_JSON_PATH, "utf-8")
  );

  // Create the output directory
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const limit = pLimit(FILE_CONCURRENCY);

  const fileWhitelist = new Set([
    "10091_png.rf.a90765e31cc48705fb7241b99bef4472.pdf",
  ]);
  const results = await Promise.all(
    testInputs
      .filter((i) => fileWhitelist.has(i.file))
      .map((testInput) =>
        limit(async () => {
          const filePath = path.join(INPUT_DIR, testInput.file);

          // Check if the file exists
          if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            return null;
          }

          // Run OCR on the file
          const ocrResult = await zerox({
            cleanup: false,
            filePath,
            maintainFormat: false,
            model: ModelOptions.gpt_4o,
            openaiAPIKey: process.env.OPENAI_API_KEY,
            outputDir: OUTPUT_DIR,
            tempDir: TEMP_DIR,
          });

          // Compare expected keywords with OCR output
          const keywordCounts = compareKeywords(
            ocrResult.pages,
            testInput.expectedKeywords
          );

          // Prepare the result
          return {
            file: testInput.file,
            keywordCounts,
            totalKeywords: testInput.expectedKeywords.flat().length,
          };
        })
      )
  );

  // Filter out any null results (due to missing files)
  const filteredResults = results.filter((result) => result !== null);
  const tableData = filteredResults.map((result) => {
    const totalFound = result.keywordCounts.reduce(
      (sum, page) => sum + page.keywordsFound.length,
      0
    );
    const totalMissing = result.keywordCounts.reduce(
      (sum, page) => sum + page.keywordsMissing.length,
      0
    );
    const totalKeywords = totalFound + totalMissing;
    const percentage =
      totalKeywords > 0
        ? ((totalFound / totalKeywords) * 100).toFixed(2) + "%"
        : "N/A";

    return {
      fileName: result.file,
      keywordsFound: totalFound,
      keywordsMissing: totalMissing,
      percentage,
    };
  });

  // Write the test results to output.json
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "output.json"),
    JSON.stringify(filteredResults, null, 2)
  );

  const T2 = new Date();
  const completionTime = ((T2.getTime() - T1.getTime()) / 1000).toFixed(2);

  // Calculate overall accuracy and total pages tested
  const totalKeywordsFound = filteredResults.reduce(
    (sum, result) =>
      sum +
      result.keywordCounts.reduce(
        (s, page) => s + page.keywordsFound.length,
        0
      ),
    0
  );
  const totalKeywordsMissing = filteredResults.reduce(
    (sum, result) =>
      sum +
      result.keywordCounts.reduce(
        (s, page) => s + page.keywordsMissing.length,
        0
      ),
    0
  );
  const totalKeywords = totalKeywordsFound + totalKeywordsMissing;
  const overallAccuracy =
    totalKeywords > 0
      ? ((totalKeywordsFound / totalKeywords) * 100).toFixed(2) + "%"
      : "N/A";

  const pagesTested = filteredResults.reduce(
    (sum, result) => sum + result.keywordCounts.length,
    0
  );

  console.log("\n");
  console.log("-------------------------------------------------------------");
  console.log("Test complete in", completionTime, "seconds");
  console.log("Overall accuracy:", overallAccuracy);
  console.log("Pages tested:", pagesTested);
  console.log("-------------------------------------------------------------");
  console.table(tableData);
  console.log("-------------------------------------------------------------");
  console.log(`Full test results are available in ${OUTPUT_DIR}`);
  console.log("-------------------------------------------------------------");
  console.log("\n");
}

main().catch((error) => {
  console.error("An error occurred during the test run:", error);
});