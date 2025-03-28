import {
  AzureCredentials,
  AzureLLMParams,
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  MessageContentArgs,
  ModelInterface,
  OperationMode,
} from "../types";
import { AzureOpenAI } from "openai";
import {
  cleanupImage,
  convertKeysToCamelCase,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import fs from "fs-extra";

export default class AzureModel implements ModelInterface {
  private client: AzureOpenAI;
  private llmParams?: Partial<AzureLLMParams>;

  constructor(
    credentials: AzureCredentials,
    model: string,
    llmParams?: Partial<AzureLLMParams>
  ) {
    this.client = new AzureOpenAI({
      apiKey: credentials.apiKey,
      apiVersion: "2024-10-21",
      deployment: model,
      endpoint: credentials.endpoint,
    });
    this.llmParams = llmParams;
  }

  async getCompletion(
    mode: OperationMode,
    params: CompletionArgs | ExtractionArgs
  ): Promise<CompletionResponse | ExtractionResponse> {
    const modeHandlers = {
      [OperationMode.EXTRACTION]: () =>
        this.handleExtraction(params as ExtractionArgs),
      [OperationMode.OCR]: () => this.handleOCR(params as CompletionArgs),
    };

    const handler = modeHandlers[mode];
    if (!handler) {
      throw new Error(`Unsupported operation mode: ${mode}`);
    }

    return await handler();
  }

  private async createMessageContent({
    input,
    options,
  }: MessageContentArgs): Promise<any> {
    const processImages = async (imagePaths: string[]) => {
      const nestedImages = await Promise.all(
        imagePaths.map(async (imagePath) => {
          const imageBuffer = await fs.readFile(imagePath);
          const buffers = await cleanupImage({
            correctOrientation: options?.correctOrientation ?? false,
            imageBuffer,
            scheduler: options?.scheduler ?? null,
            trimEdges: options?.trimEdges ?? false,
          });
          return buffers.map((buffer) => ({
            image_url: {
              url: `data:image/png;base64,${encodeImageToBase64(buffer)}`,
            },
            type: "image_url",
          }));
        })
      );
      return nestedImages.flat();
    };

    if (Array.isArray(input)) {
      return processImages(input);
    }

    if (typeof input === "string") {
      return [{ text: input, type: "text" }];
    }

    const { imagePaths, text } = input;
    const images = await processImages(imagePaths);
    return [...images, { text, type: "text" }];
  }

  private async handleOCR({
    buffers,
    maintainFormat,
    priorPage,
    prompt,
  }: CompletionArgs): Promise<CompletionResponse> {
    const systemPrompt = prompt || SYSTEM_PROMPT_BASE;

    // Default system message
    const messages: any = [{ role: "system", content: systemPrompt }];

    // If content has already been generated, add it to context.
    // This helps maintain the same format across pages
    if (maintainFormat && priorPage && priorPage.length) {
      messages.push({
        role: "system",
        content: CONSISTENCY_PROMPT(priorPage),
      });
    }

    // Add image to request
    const imageContents = buffers.map((buffer) => ({
      type: "image_url",
      image_url: {
        url: `data:image/png;base64,${encodeImageToBase64(buffer)}`,
      },
    }));
    messages.push({ role: "user", content: imageContents });

    try {
      const response = await this.client.chat.completions.create({
        messages,
        model: "",
        ...convertKeysToSnakeCase(this.llmParams ?? null),
      });

      const result: CompletionResponse = {
        content: response.choices[0].message.content || "",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };

      if (this.llmParams?.logprobs) {
        result["logprobs"] = convertKeysToCamelCase(
          response.choices[0].logprobs
        )?.content;
      }

      return result;
    } catch (err) {
      console.error("Error in Azure completion", err);
      throw err;
    }
  }

  private async handleExtraction({
    input,
    options,
    prompt,
    schema,
  }: ExtractionArgs): Promise<ExtractionResponse> {
    try {
      const messages: any = [];

      if (prompt) {
        messages.push({ role: "system", content: prompt });
      }

      messages.push({
        role: "user",
        content: await this.createMessageContent({ input, options }),
      });

      const response = await this.client.chat.completions.create({
        messages,
        model: "",
        response_format: {
          json_schema: { name: "extraction", schema },
          type: "json_schema",
        },
        ...convertKeysToSnakeCase(this.llmParams ?? null),
      });

      const result: ExtractionResponse = {
        extracted: JSON.parse(response.choices[0].message.content || ""),
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };

      if (this.llmParams?.logprobs) {
        result["logprobs"] = convertKeysToCamelCase(
          response.choices[0].logprobs
        )?.content;
      }

      return result;
    } catch (err) {
      console.error("Error in Azure completion", err);
      throw err;
    }
  }
}
