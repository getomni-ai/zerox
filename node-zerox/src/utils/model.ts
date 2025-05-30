import {
  CompletionResponse,
  ExtractionResponse,
  OperationMode,
  ProcessedCompletionResponse,
  ProcessedExtractionResponse,
} from "../types";
import { formatMarkdown } from "./common";

export const isCompletionResponse = (
  mode: OperationMode,
  response: CompletionResponse | ExtractionResponse
): response is CompletionResponse => {
  return mode === OperationMode.OCR;
};

const isExtractionResponse = (
  mode: OperationMode,
  response: CompletionResponse | ExtractionResponse
): response is ExtractionResponse => {
  return mode === OperationMode.EXTRACTION;
};

export class CompletionProcessor {
  static process<T extends OperationMode>(
    mode: T,
    response: CompletionResponse | ExtractionResponse
  ): T extends OperationMode.EXTRACTION
    ? ProcessedExtractionResponse
    : ProcessedCompletionResponse {
    const { logprobs, ...responseWithoutLogprobs } = response;
    if (isCompletionResponse(mode, response)) {
      const content = response.content;
      return {
        ...responseWithoutLogprobs,
        content:
          typeof content === "string" ? formatMarkdown(content) : content,
        contentLength: response.content?.length || 0,
      } as T extends OperationMode.EXTRACTION
        ? ProcessedExtractionResponse
        : ProcessedCompletionResponse;
    }
    if (isExtractionResponse(mode, response)) {
      const extracted = response.extracted;
      return {
        ...responseWithoutLogprobs,
        extracted:
          typeof extracted === "object" ? extracted : JSON.parse(extracted),
      } as T extends OperationMode.EXTRACTION
        ? ProcessedExtractionResponse
        : ProcessedCompletionResponse;
    }
    return responseWithoutLogprobs as T extends OperationMode.EXTRACTION
      ? ProcessedExtractionResponse
      : ProcessedCompletionResponse;
  }
}
