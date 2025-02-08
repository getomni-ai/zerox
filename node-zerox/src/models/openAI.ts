import {
  CompletionArgs,
  CompletionResponse,
  ModelInterface,
  OpenAICredentials,
  OpenAILLMParams,
} from "../types";
import { CONSISTENCY_PROMPT, SYSTEM_PROMPT_BASE } from "../constants";
import { convertKeysToSnakeCase, encodeImageToBase64 } from "../utils";
import axios from "axios";

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
      };
    } catch (err) {
      console.error("Error in OpenAI completion", err);
      throw err;
    }
  }
}
