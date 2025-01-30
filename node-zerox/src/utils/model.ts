import { LLMParams, ModelOptions, ModelProvider } from "../types";

const providerDefaultParams: Record<ModelProvider | string, LLMParams> = {
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

const providerModels = {
  [ModelProvider.BEDROCK]: [
    ModelOptions.BEDROCK_CLAUDE_3_HAIKU_2024_03,
    ModelOptions.BEDROCK_CLAUDE_3_HAIKU_2024_10,
    ModelOptions.BEDROCK_CLAUDE_3_SONNET_2024_02,
    ModelOptions.BEDROCK_CLAUDE_3_SONNET_2024_06,
    ModelOptions.BEDROCK_CLAUDE_3_SONNET_2024_10,
    ModelOptions.BEDROCK_CLAUDE_3_OPUS_2024_02,
  ],
  [ModelProvider.OPENAI]: [
    ModelOptions.OPENAI_GPT_4O,
    ModelOptions.OPENAI_GPT_4O_MINI,
  ],
};

const isValidModel = (m: string): m is ModelOptions => {
  return Object.values(ModelOptions).includes(m as ModelOptions);
};

const isValidProvider = (p: string): p is ModelProvider => {
  return Object.values(ModelProvider).includes(p as ModelProvider);
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

export const validateModelProvider = (
  model: ModelOptions | string,
  provider: ModelProvider | string
): void => {
  // Validate model
  if (!isValidModel(model)) {
    throw new Error(`Invalid model: ${model}`);
  }

  // Validate provider
  if (!isValidProvider(provider)) {
    throw new Error(`Invalid provider: ${provider}`);
  }

  const supportedModels = providerModels[provider];
  if (!supportedModels?.includes(model)) {
    throw new Error(`Model ${model} is not supported by provider ${provider}`);
  }
};
