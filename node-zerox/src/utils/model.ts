import {
  CompletionProcessParams,
  CompletionResponse,
  ExtractionProcessParams,
  ExtractionResponse,
  LLMParams,
  ModelProvider,
  OperationMode,
  ProcessedCompletionResponse,
  ProcessedExtractionResponse,
  ProcessParams,
} from "../types";
import { formatMarkdown } from "./common";
import { validate } from "./validate";

const isExtractionParams = (
  params: ProcessParams
): params is ExtractionProcessParams => {
  return params.mode === OperationMode.EXTRACTION;
};

const isCompletionParams = (
  params: ProcessParams
): params is CompletionProcessParams => {
  return params.mode === OperationMode.OCR;
};

export const isCompletionResponse = (
  mode: OperationMode,
  response: CompletionResponse | ExtractionResponse
): response is CompletionResponse => {
  return mode === OperationMode.OCR;
};

export class CompletionProcessor {
  // Overload for extraction mode
  static process(params: ExtractionProcessParams): ProcessedExtractionResponse;

  // Overload for OCR mode
  static process(params: CompletionProcessParams): ProcessedCompletionResponse;

  static process(
    params: ProcessParams
  ): ProcessedExtractionResponse | ProcessedCompletionResponse {
    if (isCompletionParams(params)) {
      const { response } = params;
      const { logprobs, ...responseWithoutLogprobs } = response;

      const content = response.content;
      return {
        ...responseWithoutLogprobs,
        content:
          typeof content === "string" ? formatMarkdown(content) : content,
        contentLength: response.content?.length || 0,
      } as ProcessedCompletionResponse;
    }
    if (isExtractionParams(params)) {
      const { response, schema } = params;
      const { logprobs, ...responseWithoutLogprobs } = response;
      const extracted =
        typeof response.extracted === "object"
          ? response.extracted
          : JSON.parse(response.extracted);
      const result = validate({ schema, value: extracted });
      return {
        ...responseWithoutLogprobs,
        extracted: result.value,
        issues: result.issues,
      } as ProcessedExtractionResponse;
    }
    throw new Error(`Unsupported operation mode: ${params["mode"]}`);
  }
}

const providerDefaultParams: Record<ModelProvider | string, LLMParams> = {
  [ModelProvider.AZURE]: {
    frequencyPenalty: 0,
    logprobs: false,
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
  [ModelProvider.GOOGLE]: {
    frequencyPenalty: 0,
    maxOutputTokens: 4000,
    presencePenalty: 0,
    temperature: 0,
    topP: 1,
  },
  [ModelProvider.OPENAI]: {
    frequencyPenalty: 0,
    logprobs: false,
    maxTokens: 4000,
    presencePenalty: 0,
    temperature: 0,
    topP: 1,
  },
};

export const validateLLMParams = <T extends LLMParams>(
  params: Partial<T>,
  provider: ModelProvider | string
): LLMParams => {
  const defaultParams = providerDefaultParams[provider];

  if (!defaultParams) {
    throw new Error(`Unsupported model provider: ${provider}`);
  }

  const validKeys = new Set(Object.keys(defaultParams));
  for (const [key, value] of Object.entries(params)) {
    if (!validKeys.has(key)) {
      throw new Error(
        `Invalid LLM parameter for ${provider}: ${key}. Valid parameters are: ${Array.from(
          validKeys
        ).join(", ")}`
      );
    }

    const expectedType = typeof defaultParams[key as keyof LLMParams];
    if (typeof value !== expectedType) {
      throw new Error(`Value for '${key}' must be a ${expectedType}`);
    }
  }

  return { ...defaultParams, ...params };
};
