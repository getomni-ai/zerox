import {
  AzureCredentials,
  BedrockCredentials,
  CreateModelArgs,
  GoogleCredentials,
  ModelInterface,
  ModelProvider,
  OpenAICredentials,
} from "../types";
import { validateLLMParams } from "../utils/model";
import AzureModel from "./azure";
import BedrockModel from "./bedrock";
import GoogleModel from "./google";
import OpenAIModel from "./openAI";

// Type guard for Azure credentials
const isAzureCredentials = (
  credentials: any
): credentials is AzureCredentials => {
  return (
    credentials &&
    typeof credentials.endpoint === "string" &&
    typeof credentials.apiKey === "string"
  );
};

// Type guard for Bedrock credentials
const isBedrockCredentials = (
  credentials: any
): credentials is BedrockCredentials => {
  return credentials && typeof credentials.region === "string";
};

// Type guard for Google credentials
const isGoogleCredentials = (
  credentials: any
): credentials is GoogleCredentials => {
  return credentials && typeof credentials.apiKey === "string";
};

// Type guard for OpenAI credentials
const isOpenAICredentials = (
  credentials: any
): credentials is OpenAICredentials => {
  return credentials && typeof credentials.apiKey === "string" && credentials.baseUrl;
};

export const createModel = ({
  credentials,
  llmParams,
  model,
  provider,
}: CreateModelArgs): ModelInterface => {
  const validatedParams = validateLLMParams(llmParams, provider);

  switch (provider) {
    case ModelProvider.AZURE:
      if (!isAzureCredentials(credentials)) {
        throw new Error("Invalid credentials for Azure provider");
      }
      return new AzureModel(credentials, model, validatedParams);
    case ModelProvider.BEDROCK:
      if (!isBedrockCredentials(credentials)) {
        throw new Error("Invalid credentials for Bedrock provider");
      }
      return new BedrockModel(credentials, model, validatedParams);
    case ModelProvider.GOOGLE:
      if (!isGoogleCredentials(credentials)) {
        throw new Error("Invalid credentials for Google provider");
      }
      return new GoogleModel(credentials, model, validatedParams);
    case ModelProvider.OPENAI:
      if (!isOpenAICredentials(credentials)) {
        throw new Error("Invalid credentials for OpenAI provider");
      }
      return new OpenAIModel(credentials, model, validatedParams);
    default:
      throw new Error(`Unsupported model provider: ${provider}`);
  }
};
