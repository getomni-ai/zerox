import {
  CoreMessage,
  generateObject,
  generateText,
  jsonSchema,
  UserContent,
} from "ai";
import fs from "fs-extra";
import { z } from "zod/v4";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import {
  AIModel,
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  MessageContentArgs,
  ModelInterface,
  ModelProvider,
  OperationMode,
} from "../types";
import { cleanupImage, encodeImageToBase64 } from "../utils";

/**
 * Unified AI SDK model implementation that supports multiple providers
 * (OpenAI, Azure, Google, Bedrock) through the Vercel AI SDK.
 *
 * This class replaces the provider-specific model implementations
 * and provides a consistent interface for all supported providers.
 */
export default class AISDKModel implements ModelInterface {
  private aiModel: AIModel;
  private provider: ModelProvider | string;
  private modelName: string;
  private llmParams: any;

  /**
   * Creates a new AISDKModel instance
   * @param aiModel - The AI SDK model instance
   * @param provider - The model provider (e.g. OpenAI, Azure, Google, Bedrock, OpenRouter)
   * @param modelName - The specific model name
   * @param llmParams - Optional LLM parameters for customization
   */
  constructor(
    aiModel: AIModel,
    provider: ModelProvider | string,
    modelName: string,
    llmParams?: any
  ) {
    // Input validation
    if (!aiModel) {
      throw new Error("AI model is required");
    }
    if (!provider) {
      throw new Error("Provider is required");
    }
    if (!modelName) {
      throw new Error("Model name is required");
    }

    this.aiModel = aiModel;
    this.provider = provider;
    this.modelName = modelName;
    this.llmParams = llmParams || {};
  }

  /**
   * Centralized error handling with context
   */
  private handleError(operation: string, error: unknown): never {
    console.error(`Error in AI SDK ${operation}:`, {
      provider: this.provider,
      model: this.modelName,
      error: error instanceof Error ? error.message : error,
    });
    throw error;
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

    return handler();
  }

  private async createMessageContent({
    input,
    options,
  }: MessageContentArgs): Promise<UserContent> {
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
            type: "image" as const,
            image: `data:image/png;base64,${encodeImageToBase64(buffer)}`,
          }));
        })
      );
      return nestedImages.flat();
    };

    if (Array.isArray(input)) {
      return processImages(input);
    }

    if (typeof input === "string") {
      return [{ type: "text" as const, text: input }];
    }

    const { imagePaths, text } = input;
    const images = await processImages(imagePaths);
    return [...images, { type: "text" as const, text }];
  }

  private async handleOCR({
    buffers,
    maintainFormat,
    priorPage,
    prompt,
  }: CompletionArgs): Promise<CompletionResponse> {
    const systemPrompt = prompt || SYSTEM_PROMPT_BASE;

    // Build messages array with proper AI SDK types
    const messages: CoreMessage[] = [{ role: "system", content: systemPrompt }];

    // If content has already been generated, add it to context
    if (maintainFormat && priorPage && priorPage.length) {
      messages.push({
        role: "system",
        content: CONSISTENCY_PROMPT(priorPage),
      });
    }

    // Add images to user message
    const imageContents = buffers.map((buffer) => ({
      type: "image" as const,
      image: `data:image/png;base64,${encodeImageToBase64(buffer)}`,
    }));

    messages.push({
      role: "user",
      content: imageContents,
    });

    try {
      const result = await generateText({
        model: this.aiModel,
        messages,
        ...this.llmParams,
      });

      return {
        content: result.text,
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
      };
    } catch (err) {
      this.handleError("OCR completion", err);
    }
  }

  private async handleExtraction({
    input,
    options,
    prompt,
    schema,
  }: ExtractionArgs): Promise<ExtractionResponse> {
    try {
      const messages: CoreMessage[] = [];

      if (prompt) {
        messages.push({ role: "system", content: prompt });
      }

      const content = await this.createMessageContent({ input, options });
      messages.push({
        role: "user",
        content,
      });

      const isZodSchema = schema instanceof z.ZodType;

      const result = await generateObject({
        model: this.aiModel,
        messages,
        schema: isZodSchema ? schema : (jsonSchema(schema) as any),
        ...this.llmParams,
      });

      return {
        extracted: result.object as Record<string, unknown>,
        inputTokens: result.usage?.promptTokens ?? 0,
        outputTokens: result.usage?.completionTokens ?? 0,
      };
    } catch (err) {
      this.handleError("extraction", err);
    }
  }
}
