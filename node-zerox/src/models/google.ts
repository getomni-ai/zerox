import {
  cleanupImage,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import {
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  GoogleCredentials,
  GoogleLLMParams,
  MessageContentArgs,
  ModelInterface,
  OperationMode,
} from "../types";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs-extra";

export default class GoogleModel implements ModelInterface {
  private client: GoogleGenerativeAI;
  private model: string;
  private llmParams?: Partial<GoogleLLMParams>;

  constructor(
    credentials: GoogleCredentials,
    model: string,
    llmParams?: Partial<GoogleLLMParams>
  ) {
    this.client = new GoogleGenerativeAI(credentials.apiKey);
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
            inlineData: {
              data: encodeImageToBase64(correctedBuffer),
              mimeType: "image/png",
            },
          };
        })
      );
    }

    return [{ text: input }];
  }

  private async handleOCR({
    image,
    maintainFormat,
    priorPage,
    prompt,
  }: CompletionArgs): Promise<CompletionResponse> {
    const generativeModel = this.client.getGenerativeModel({
      generationConfig: convertKeysToSnakeCase(this.llmParams ?? null),
      model: this.model,
    });

    // Build the prompt parts
    const promptParts: any = [];

    // Add system prompt
    promptParts.push({ text: prompt || SYSTEM_PROMPT_BASE });

    // If content has already been generated, add it to context
    if (maintainFormat && priorPage && priorPage.length) {
      promptParts.push({ text: CONSISTENCY_PROMPT(priorPage) });
    }

    // Add image to request
    const base64Image = await encodeImageToBase64(image);
    const imageData = {
      inlineData: {
        data: base64Image,
        mimeType: "image/png",
      },
    };
    promptParts.push(imageData);

    try {
      const result = await generativeModel.generateContent({
        contents: [{ role: "user", parts: promptParts }],
      });

      const response = await result.response;

      return {
        content: response.text(),
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };
    } catch (err) {
      console.error("Error in Google completion", err);
      throw err;
    }
  }

  private async handleExtraction({
    input,
    options,
    prompt,
    schema,
  }: ExtractionArgs): Promise<ExtractionResponse> {
    const generativeModel = this.client.getGenerativeModel({
      generationConfig: {
        ...convertKeysToSnakeCase(this.llmParams ?? null),
        responseMimeType: "application/json",
        responseSchema: schema,
      },
      model: this.model,
    });

    // Build the prompt parts
    const promptParts: any = [];

    // Add system prompt
    const text = prompt || "Extract schema data";
    promptParts.push({ text });

    const parts = await this.createMessageContent({ input, options });
    promptParts.push(...parts);

    try {
      const result = await generativeModel.generateContent({
        contents: [{ role: "user", parts: promptParts }],
      });

      const response = await result.response;

      return {
        extracted: JSON.parse(response.text()),
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };
    } catch (err) {
      console.error("Error in Google completion", err);
      throw err;
    }
  }
}
