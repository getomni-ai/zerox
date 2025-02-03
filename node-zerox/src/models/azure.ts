import { AzureOpenAI } from "openai";
import {
  AzureCredentials,
  CompletionArgs,
  CompletionResponse,
  LLMParams,
  ModelInterface,
} from "../types";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import { convertKeysToSnakeCase, encodeImageToBase64 } from "../utils";

export default class AzureModel implements ModelInterface {
  private client: AzureOpenAI;
  private llmParams?: Partial<LLMParams>;

  constructor(
    credentials: AzureCredentials,
    model: string,
    llmParams?: Partial<LLMParams>
  ) {
    this.client = new AzureOpenAI({
      apiKey: credentials.apiKey,
      apiVersion: "2024-10-21",
      deployment: model,
      endpoint: credentials.endpoint,
    });
    this.llmParams = llmParams;
  }

  async getCompletion({
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
}
