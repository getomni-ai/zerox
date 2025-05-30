import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAzure } from "@ai-sdk/azure";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { CreateModelArgs, ModelInterface, ModelProvider } from "../types";
import AISDKModel from "./ai-sdk";

// Create AI SDK model instance for built-in providers
const createBuiltInProvider = (
  credentials: any,
  provider: ModelProvider,
  model: string
) => {
  // Validate credentials for built-in providers
  if (
    !credentials ||
    (typeof credentials === "object" &&
      Object.values(credentials).every((credential) => !credential))
  ) {
    throw new Error(`Missing credentials for ${provider} provider`);
  }

  switch (provider) {
    case ModelProvider.OPENAI:
      return createOpenAI(credentials)(model);

    case ModelProvider.AZURE:
      return createAzure(credentials)(model);

    case ModelProvider.GOOGLE:
      return createGoogleGenerativeAI(credentials)(model);

    case ModelProvider.BEDROCK:
      return createAmazonBedrock(credentials)(model);

    case ModelProvider.OPENROUTER:
      return createOpenRouter({
        ...credentials,
        headers: {
          "X-Title": "zerox",
          "HTTP-Referer": "https://github.com/getomni-ai/zerox",
        },
      })(model);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
};

export const createModel = ({
  credentials,
  llmParams,
  model,
  provider,
}: CreateModelArgs): ModelInterface => {
  // Handle built-in enum providers
  if (
    typeof provider === "string" &&
    Object.values(ModelProvider).includes(provider as ModelProvider)
  ) {
    const aiModel = createBuiltInProvider(
      credentials,
      provider as ModelProvider,
      model
    );
    return new AISDKModel(aiModel, provider, model, llmParams);
  }

  // Handle custom provider functions or instances
  if (typeof provider === "function") {
    // Check if it's a provider instance (has languageModel property)
    if ("languageModel" in provider) {
      // Provider instance - use directly
      const aiModel = (provider as any).languageModel(model);
      return new AISDKModel(aiModel, "custom", model, llmParams);
    } else {
      // Provider function - call with credentials
      const providerInstance = provider(credentials);
      const aiModel = (providerInstance as any).languageModel(model);
      return new AISDKModel(aiModel, "custom", model, llmParams);
    }
  }

  // Handle provider instances (objects with languageModel method)
  if (
    typeof provider === "object" &&
    provider !== null &&
    "languageModel" in provider
  ) {
    const aiModel = (provider as any).languageModel(model);
    return new AISDKModel(aiModel, "custom", model, llmParams);
  }

  throw new Error(`Invalid provider: ${provider}`);
};
