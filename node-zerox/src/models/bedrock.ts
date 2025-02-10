import {
  BedrockCredentials,
  BedrockLLMParams,
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  ModelInterface,
  OperationMode,
} from "../types";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  CompletionProcessor,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";

// Currently only supports Anthropic models
export default class BedrockModel implements ModelInterface {
  private client: BedrockRuntimeClient;
  private mode: OperationMode;
  private model: string;
  private llmParams?: Partial<BedrockLLMParams>;

  constructor(
    credentials: BedrockCredentials,
    mode: OperationMode,
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
    this.mode = mode;
    this.model = model;
    this.llmParams = llmParams;
  }

  async getCompletion(
    params: CompletionArgs | ExtractionArgs
  ): Promise<CompletionResponse | ExtractionResponse> {
    const modeHandlers = {
      [OperationMode.EXTRACTION]: () =>
        this.handleExtraction(params as ExtractionArgs),
      [OperationMode.OCR]: () => this.handleOCR(params as CompletionArgs),
    };

    const handler = modeHandlers[this.mode];
    if (!handler) {
      throw new Error(`Unsupported operation mode: ${this.mode}`);
    }

    const response = await handler();
    return {
      ...response,
      content: CompletionProcessor.process(this.mode, response.content),
    };
  }

  private async handleOCR({
    image,
    maintainFormat,
    priorPage,
  }: CompletionArgs): Promise<CompletionResponse> {
    let systemPrompt = SYSTEM_PROMPT_BASE;

    // Default system message
    const messages: any = [];

    // If content has already been generated, add it to context.
    // This helps maintain the same format across pages
    if (maintainFormat && priorPage && priorPage.length) {
      systemPrompt += `\n\n${CONSISTENCY_PROMPT(priorPage)}`;
    }

    // Add image to request
    const base64Image = await encodeImageToBase64(image);
    messages.push({
      role: "user",
      content: [
        {
          type: "image",
          source: {
            data: base64Image,
            media_type: "image/png",
            type: "base64",
          },
        },
      ],
    });

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
    image,
    schema,
  }: ExtractionArgs): Promise<ExtractionResponse> {
    const base64Image = await encodeImageToBase64(image);
    const messages = {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            data: base64Image,
            media_type: "image/png",
            type: "base64",
          },
        },
      ],
    };

    try {
      const body = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: this.llmParams?.maxTokens || 4096,
        messages,
        schema,
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
}
