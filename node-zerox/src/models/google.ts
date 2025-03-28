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
            inlineData: {
              data: encodeImageToBase64(buffer),
              mimeType: "image/png",
            },
          }));
        })
      );
      return nestedImages.flat();
    };

    if (Array.isArray(input)) {
      return processImages(input);
    }

    if (typeof input === "string") {
      return [{ text: input }];
    }

    const { imagePaths, text } = input;
    const images = await processImages(imagePaths);
    return [...images, { text }];
  }

  private async handleOCR({
    buffers,
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
    const imageContents = buffers.map((buffer) => ({
      inlineData: {
        data: encodeImageToBase64(buffer),
        mimeType: "image/png",
      },
    }));
    promptParts.push(...imageContents);

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
    promptParts.push({ text: prompt || "Extract schema data" });

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
