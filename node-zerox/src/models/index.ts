import {
  BedrockCredentials,
  CreateModelArgs,
  ModelInterface,
  ModelProvider,
  OpenAICredentials,
} from "../types";
import BedrockModel from "./bedrock";
import OpenAIModel from "./openAI";
import { validateLLMParams } from "../utils/model";

// Type guard for Bedrock credentials
const isBedrockCredentials = (
  credentials: any
): credentials is BedrockCredentials => {
  return credentials && typeof credentials.region === "string";
};

// Type guard for OpenAI credentials
const isOpenAICredentials = (
  credentials: any
): credentials is OpenAICredentials => {
  return credentials && typeof credentials.apiKey === "string";
};

export const createModel = ({
  credentials,
  llmParams,
  model,
  provider,
}: CreateModelArgs): ModelInterface => {
  const validatedParams = validateLLMParams(llmParams, provider);

  switch (provider) {
    case ModelProvider.BEDROCK:
      if (!isBedrockCredentials(credentials)) {
        throw new Error("Invalid credentials for Bedrock provider");
      }
      return new BedrockModel(credentials, model, validatedParams);
    case ModelProvider.OPENAI:
      if (!isOpenAICredentials(credentials)) {
        throw new Error("Invalid credentials for OpenAI provider");
      }
      return new OpenAIModel(credentials, model, validatedParams);

    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
};
