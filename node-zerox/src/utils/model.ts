import { LLMParams, ModelProvider } from "../types";

const providerDefaultParams: Record<ModelProvider | string, LLMParams> = {
  [ModelProvider.AZURE]: {
    frequencyPenalty: 0,
    maxTokens: 4000,
    presencePenalty: 0,
    temperature: 0,
    topP: 1,
  },
  [ModelProvider.BEDROCK]: {
    maxTokens: 4000,
    temperature: 0,
    topP: 1,
  },
  [ModelProvider.OPENAI]: {
    frequencyPenalty: 0,
    maxTokens: 4000,
    presencePenalty: 0,
    temperature: 0,
    topP: 1,
  },
};

export const validateLLMParams = (
  params: Partial<LLMParams>,
  provider: ModelProvider | string
): LLMParams => {
  const defaultParams = providerDefaultParams[provider];

  if (!defaultParams) {
    throw new Error(`Unsupported model provider: ${provider}`);
  }

  const validKeys = Object.keys(defaultParams);
  for (const key of Object.keys(params)) {
    if (!validKeys.includes(key)) {
      throw new Error(
        `Invalid LLM parameter for ${provider}: ${key}. Valid parameters are: ${validKeys.join(
          ", "
        )}`
      );
    }
    if (typeof params[key as keyof LLMParams] !== "number") {
      throw new Error(`Value for '${key}' must be a number`);
    }
  }

  return { ...defaultParams, ...params };
};
