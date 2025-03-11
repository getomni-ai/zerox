import {
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  MessageContentArgs,
  ModelInterface,
  OpenAICredentials,
  OpenAILLMParams,
  OperationMode,
} from "../types";
import {
  cleanupImage,
  convertKeysToCamelCase,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import axios from "axios";
import fs from "fs-extra";

export default class OpenAIModel implements ModelInterface {
  private apiKey: string;
  private model: string;
  private llmParams?: Partial<OpenAILLMParams>;

  constructor(
    credentials: OpenAICredentials,
    model: string,
    llmParams?: Partial<OpenAILLMParams>
  ) {
    this.apiKey = credentials.apiKey;
    this.model = model;
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
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          messages,
          model: this.model,
          ...convertKeysToSnakeCase(this.llmParams ?? null),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data;

      return {
        content: data.choices[0].message.content,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        ...(this.llmParams?.logprobs
          ? {
              logprobs: convertKeysToCamelCase(data.choices[0].logprobs)
                ?.content,
            }
          : {}),
      };
    } catch (err) {
      console.error("Error in OpenAI completion", err);
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

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          messages,
          model: this.model,
          response_format: {
            json_schema: { name: "extraction", schema },
            type: "json_schema",
          },
          ...convertKeysToSnakeCase(this.llmParams ?? null),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data;

      return {
        extracted: data.choices[0].message.content,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        ...(this.llmParams?.logprobs
          ? {
              logprobs: convertKeysToCamelCase(data.choices[0].logprobs)
                ?.content,
            }
          : {}),
      };
    } catch (err) {
      console.error("Error in OpenAI completion", err);
      throw err;
    }
  }
}
