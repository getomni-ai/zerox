import { ModelOptions, ModelProvider } from "zerox/node-zerox/dist/types";
import { zerox } from "zerox";

/**
 * Example using Bedrock Anthropic with Zerox to extract structured data from documents.
 * This shows extraction setup with schema definition for an invoice document.
 */
async function main() {
  // Define the schema for invoice data extraction
  const schema = {
    type: "object",
    properties: {
      invoiceNumber: { type: "string" },
      date: { type: "string" },
      totalAmount: { type: "number" },
      lineItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            description: { type: "string" },
            quantity: { type: "number" },
            price: { type: "number" },
          },
          required: ["description", "quantity", "price"],
        },
      },
    },
    required: ["invoiceNumber", "date", "totalAmount", "lineItems"],
  };

  try {
    const result = await zerox({
      credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        region: process.env.REGION || "us-east-1",
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
      },
      extractOnly: true, // Skip OCR, only perform extraction (defaults to false)
      extractPerPage: ["lineItems"], // Data to extract from each page separately
      filePath: "https://example.com/invoice.pdf",
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
