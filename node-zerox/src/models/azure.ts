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
    if (Array.isArray(input)) {
      return Promise.all(
        input.map(async (imagePath) => {
          const imageBuffer = await fs.readFile(imagePath);
          const correctedBuffer = await cleanupImage({
            correctOrientation: options?.correctOrientation ?? false,
            imageBuffer,
            scheduler: options?.scheduler ?? null,
            trimEdges: options?.trimEdges ?? false,
          });
          return {
            image_url: {
              url: `data:image/png;base64,${encodeImageToBase64(
                correctedBuffer
              )}`,
            },
            type: "image_url",
          };
        })
      );
    }

    return [{ text: input, type: "text" }];
  }

  private async handleOCR({
    image,
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
    const base64Image = await encodeImageToBase64(image);
    messages.push({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` },
        },
      ],
    });

    try {
      const response = await this.client.chat.completions.create({
        messages,
        model: "",
        ...convertKeysToSnakeCase(this.llmParams ?? null),
      });

      return {
        content: response.choices[0].message.content || "",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };
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

      return {
        extracted: JSON.parse(response.choices[0].message.content || ""),
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };
    } catch (err) {
      console.error("Error in Azure completion", err);
      throw err;
    }
  }
}
