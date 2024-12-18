import { LLMParams } from "../types";

const defaultLLMParams: LLMParams = {
  frequencyPenalty: 0, // OpenAI defaults to 0
  maxTokens: 4000,
  presencePenalty: 0, // OpenAI defaults to 0
  temperature: 0,
  topP: 1, // OpenAI defaults to 1
};

export const validateLLMParams = (params: Partial<LLMParams>): LLMParams => {
  const validKeys = Object.keys(defaultLLMParams);

  for (const [key, value] of Object.entries(params)) {
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid LLM parameter: ${key}`);
    }
    if (typeof value !== "number") {
      throw new Error(`Value for '${key}' must be a number`);
    }
  }

  return { ...defaultLLMParams, ...params };
};
