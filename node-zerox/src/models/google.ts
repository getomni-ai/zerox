import {
  CompletionArgs,
  CompletionResponse,
  LLMParams,
  ModelInterface,
  GoogleCredentials,
} from "../types";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import { convertKeysToSnakeCase, encodeImageToBase64 } from "../utils";
import { GoogleGenerativeAI } from "@google/generative-ai";

export default class GoogleModel implements ModelInterface {
  private client: GoogleGenerativeAI;
  private model: string;
  private llmParams?: Partial<LLMParams>;

  constructor(
    credentials: GoogleCredentials,
    model: string,
    llmParams?: Partial<LLMParams>
  ) {
    this.client = new GoogleGenerativeAI(credentials.apiKey);
    this.model = model;
    this.llmParams = llmParams;
  }

  async getCompletion({
    image,
    maintainFormat,
    priorPage,
  }: CompletionArgs): Promise<CompletionResponse> {
    const generativeModel = this.client.getGenerativeModel({
      generationConfig: convertKeysToSnakeCase(this.llmParams ?? null),
      model: this.model,
    });

    // Build the prompt parts
    const promptParts = [];

    // Add system prompt
    promptParts.push({ text: SYSTEM_PROMPT_BASE });

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
        // Note: Gemini might not provide token counts in the same way
        // You might need to implement a different way to count tokens
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      };
    } catch (err) {
      console.error("Error in Google completion", err);
      throw err;
    }
  }
}
