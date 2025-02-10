import {
  AzureCredentials,
  AzureLLMParams,
  CompletionArgs,
  CompletionResponse,
  ExtractionArgs,
  ExtractionResponse,
  ModelInterface,
  OperationMode,
} from "../types";
import { AzureOpenAI } from "openai";
import {
  CompletionProcessor,
  convertKeysToSnakeCase,
  encodeImageToBase64,
} from "../utils";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";

export default class AzureModel implements ModelInterface {
  private client: AzureOpenAI;
  private mode: OperationMode;
  private llmParams?: Partial<AzureLLMParams>;

  constructor(
    credentials: AzureCredentials,
    mode: OperationMode,
    model: string,
    llmParams?: Partial<AzureLLMParams>
  ) {
    this.client = new AzureOpenAI({
      apiKey: credentials.apiKey,
      apiVersion: "2024-10-21",
      deployment: model,
      endpoint: credentials.endpoint,
    });
    this.mode = mode;
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
    const systemPrompt = SYSTEM_PROMPT_BASE;

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
      console.error("Error in Azure OpenAI completion", err);
      throw err;
    }
  }

  private async handleExtraction({
    image,
    schema,
  }: ExtractionArgs): Promise<ExtractionResponse> {
    const base64Image = await encodeImageToBase64(image);
    const messages: any = [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64Image}` },
          },
        ],
      },
    ];

    try {
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
        content: response.choices[0].message.content || "",
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      };
    } catch (err) {
      console.error("Error in OpenAI completion", err);
      throw err;
    }
  }
}
