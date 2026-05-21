import { ModelProvider } from "zerox/node-zerox/dist/types";
import { zerox } from "zerox";

/**
 * Example using Baidu Qianfan ERNIE-VL through the OpenAI-compatible API.
 * Set QIANFAN_API_KEY in your environment before running this example.
 */
async function main() {
  try {
    const result = await zerox({
      credentials: {
        apiKey: process.env.QIANFAN_API_KEY || "",
        baseUrl: "https://qianfan.baidubce.com/v2",
      },
      filePath: "https://omni-demo-data.s3.amazonaws.com/test/cs101.pdf",
      model: "ernie-4.5-vl-28b-a3b",
      modelProvider: ModelProvider.OPENAI,
      pagesToConvertAsImages: 1,
    });

    console.log("Markdown:", result.pages[0]?.content);
  } catch (error) {
    console.error("Error extracting markdown with Qianfan:", error);
  }
}

main();
