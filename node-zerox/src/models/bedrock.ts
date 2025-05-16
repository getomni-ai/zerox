import {
  BedrockCredentials,
  BedrockLLMParams,
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  MessageContentArgs,
  ModelInterface,
  OperationMode,
} from "../types";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  cleanupImage,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import fs from "fs-extra";

// Currently only supports Anthropic models
export default class BedrockModel implements ModelInterface {
  private client: BedrockRuntimeClient;
  private model: string;
  private llmParams?: Partial<BedrockLLMParams>;

  constructor(
    credentials: BedrockCredentials,
    model: string,
    llmParams?: Partial<BedrockLLMParams>
  ) {
    this.client = new BedrockRuntimeClient({
      region: credentials.region,
      credentials: credentials.accessKeyId
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey!,
            sessionToken: credentials.sessionToken,
          }
        : undefined,
    });
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
            source: {
              data: encodeImageToBase64(buffer),
              media_type: "image/png",
              type: "base64",
            },
            type: "image",
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
    let systemPrompt = prompt || SYSTEM_PROMPT_BASE;

    // Default system message
    const messages: any = [];

    // If content has already been generated, add it to context.
    // This helps maintain the same format across pages
    if (maintainFormat && priorPage && priorPage.length) {
      systemPrompt += `\n\n${CONSISTENCY_PROMPT(priorPage)}`;
    }

    // Add image to request
    const imageContents = buffers.map((buffer) => ({
      source: {
        data: encodeImageToBase64(buffer),
        media_type: "image/png",
        type: "base64",
      },
      type: "image",
    }));
    messages.push({ role: "user", content: imageContents });

    try {
      const body = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: this.llmParams?.maxTokens || 4096,
        messages,
        system: systemPrompt,
        ...convertKeysToSnakeCase(this.llmParams ?? {}),
      };

      const command = new InvokeModelCommand({
        accept: "application/json",
        body: JSON.stringify(body),
        contentType: "application/json",
        modelId: this.model,
      });

      const response = await this.client.send(command);
      const parsedResponse = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      return {
        content: parsedResponse.content[0].text,
        inputTokens: parsedResponse.usage?.input_tokens || 0,
        outputTokens: parsedResponse.usage?.output_tokens || 0,
      };
    } catch (err) {
      console.error("Error in Bedrock completion", err);
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
      const messages = [
        {
          role: "user",
          content: await this.createMessageContent({ input, options }),
        },
      ];

      const tools = [
        {
          input_schema: schema,
          name: "json",
        },
      ];

      const body = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: this.llmParams?.maxTokens || 4096,
        messages,
        system: prompt,
        tool_choice: { name: "json", type: "tool" },
        tools,
        ...convertKeysToSnakeCase(this.llmParams ?? {}),
      };

      const command = new InvokeModelCommand({
        accept: "application/json",
        body: JSON.stringify(body),
        contentType: "application/json",
        modelId: this.model,
      });

      const response = await this.client.send(command);
      const parsedResponse = JSON.parse(
        new TextDecoder().decode(response.body)
      );

      return {
        extracted: parsedResponse.content[0].input,
        inputTokens: parsedResponse.usage?.input_tokens || 0,
        outputTokens: parsedResponse.usage?.output_tokens || 0,
      };
    } catch (err) {
      console.error("Error in Bedrock completion", err);
      throw err;
    }
  }
}
