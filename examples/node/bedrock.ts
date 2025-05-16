import { ModelOptions, ModelProvider } from "zerox/node-zerox/dist/types";
import { zerox } from "zerox";

/**
 * Example using Bedrock Anthropic with Zerox to extract structured data from documents.
 * This shows extraction setup with schema definition for a property report document.
 */
async function main() {
  // Define the schema for property report data extraction
  const schema = {
    type: "object",
    properties: {
      commercial_office: {
        type: "object",
        properties: {
          average: { type: "string" },
          median: { type: "string" },
        },
        required: ["average", "median"],
      },
      transactions_by_quarter: {
        type: "array",
        items: {
          type: "object",
          properties: {
            quarter: { type: "string" },
            transactions: { type: "integer" },
          },
          required: ["quarter", "transactions"],
        },
      },
      year: { type: "integer" },
    },
    required: ["commercial_office", "transactions_by_quarter", "year"],
  };

  try {
    const result = await zerox({
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        region: process.env.REGION || "us-east-1",
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
      },
      extractOnly: true, // Skip OCR, only perform extraction (defaults to false)
      filePath:
        "https://omni-demo-data.s3.amazonaws.com/test/property_report.png",
      model: ModelOptions.BEDROCK_CLAUDE_3_HAIKU_2024_03,
      modelProvider: ModelProvider.BEDROCK,
      schema,
    });
    console.log("Extracted data:", result.extracted);
  } catch (error) {
    console.error("Error extracting data:", error);
  }
}

main();
