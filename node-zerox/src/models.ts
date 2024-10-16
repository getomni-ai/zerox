import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";

const MODEL_PROVIDERS = {
  anthropic: {
    models: [
      "claude-3-5-sonnet-20240620",
      "claude-3-haiku-20240307",
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
    ],
    provider: createAnthropic,
  },
  bedrock: {
    models: [
      "anthropic.claude-3-5-sonnet-20240620-v1:0",
      "anthropic.claude-3-haiku-20240307-v1:0",
      "anthropic.claude-3-opus-20240229-v1:0",
      "anthropic.claude-3-sonnet-20240229-v1:0",
    ],
    provider: createAmazonBedrock,
  },
  gemini: {
    models: [
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
      "gemini-1.5-pro-latest",
      "gemini-1.5-pro",
    ],
    provider: createGoogleGenerativeAI,
  },
  gpt: {
    models: ["gpt-4-turbo", "gpt-4o-mini", "gpt-4o"],
    provider: createOpenAI,
  },
  mistral: {
    models: ["pixtral-12b-2409"],
    provider: createMistral,
  },
};

export const createProviderInstance = (model: string, apiKey: string) => {
  const foundProvider = Object.values(MODEL_PROVIDERS).find((group) =>
    group.models.includes(model)
  );
  if (foundProvider) {
    return foundProvider.provider({ apiKey });
  }
  throw new Error(`Model '${model}' does not support image inputs`);
};
