import type { LanguageModelV1 } from "ai";
import Tesseract from "tesseract.js";

export interface ZeroxArgs {
  cleanup?: boolean;
  concurrency?: number;
  correctOrientation?: boolean;
  credentials?: unknown;
  customModelFunction?: (params: {
    buffers: Buffer[];
    image: string;
    maintainFormat: boolean;
    pageNumber: number;
    priorPage: string;
  }) => Promise<CompletionResponse>;
  directImageExtraction?: boolean;
  enableHybridExtraction?: boolean;
  errorMode?: ErrorMode;
  extractionCredentials?: unknown;
  extractionLlmParams?: Partial<LLMParams>;
  extractionModel?: Model;
  extractionModelProvider?: ModelProviderType;
  extractionPrompt?: string;
  extractOnly?: boolean;
  extractPerPage?: string[];
  filePath: string;
  imageDensity?: number;
  imageHeight?: number;
  imageFormat?: "png" | "jpeg";
  llmParams?: Partial<LLMParams>;
  maintainFormat?: boolean;
  maxImageSize?: number;
  maxRetries?: number;
  maxTesseractWorkers?: number;
  model?: Model;
  modelProvider?: ModelProviderType;
  openaiAPIKey?: string;
  outputDir?: string;
  pagesToConvertAsImages?: number | number[];
  prompt?: string;
  schema?: Record<string, unknown>;
  tempDir?: string;
  trimEdges?: boolean;
}

export interface ZeroxOutput {
  completionTime: number;
  extracted: Record<string, unknown> | null;
  fileName: string;
  inputTokens: number;
  logprobs?: Logprobs;
  outputTokens: number;
  pages: Page[];
  summary: Summary;
}

export interface AzureCredentials {
  apiKey: string;
  resourceName?: string;
  apiVersion?: string;
  baseURL?: string;
}

export interface BedrockCredentials {
  accessKeyId?: string;
  region: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

export interface GoogleCredentials {
  apiKey: string;
}

export interface OpenAICredentials {
  apiKey: string;
}

export interface OpenRouterCredentials {
  apiKey: string;
}

export type ModelCredentials =
  | AzureCredentials
  | BedrockCredentials
  | GoogleCredentials
  | OpenAICredentials
  | OpenRouterCredentials;

// Model options as string literals with fallback to any string
export type Model =
  // predefined strings for better Developer Experience
  // Bedrock Claude 3 Model
  | "anthropic.claude-3-5-haiku-20241022-v1:0"
  | "anthropic.claude-3-5-sonnet-20240620-v1:0"
  | "anthropic.claude-3-5-sonnet-20241022-v2:0"
  | "anthropic.claude-3-haiku-20240307-v1:0"
  | "anthropic.claude-3-opus-20240229-v1:0"
  | "anthropic.claude-3-sonnet-20240229-v1:0"
  // OpenAI GPT-4 Model
  | "gpt-4.1"
  | "gpt-4.1-mini"
  | "gpt-4o"
  | "gpt-4o-mini"
  // Google Gemini Model
  | "gemini-1.5-flash"
  | "gemini-1.5-flash-8b"
  | "gemini-1.5-pro"
  | "gemini-2.5-pro-preview-03-25"
  | "gemini-2.0-flash-001"
  | "gemini-2.0-flash-lite-preview-02-05"
  // Allow any other string
  | (string & {});

// Type for any provider creation function - flexible enough for AI SDK providers
export type ProviderFunction = (options?: any) => {
  languageModel: (modelId: string) => LanguageModelV1;
};

// Type for provider instances (the result of calling a provider creation function)
export type ProviderInstance = {
  languageModel: (modelId: string) => LanguageModelV1;
};

// Update the provider type to accept enum, provider function, or provider instance
export type ModelProviderType =
  | ModelProvider
  | ProviderFunction
  | ProviderInstance;

export enum ModelProvider {
  AZURE = "AZURE",
  BEDROCK = "BEDROCK",
  GOOGLE = "GOOGLE",
  OPENAI = "OPENAI",
  OPENROUTER = "OPENROUTER",
}

export enum OperationMode {
  EXTRACTION = "EXTRACTION",
  OCR = "OCR",
}

export enum PageStatus {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export interface Page {
  content?: string;
  contentLength?: number;
  error?: string;
  extracted?: Record<string, unknown>;
  inputTokens?: number;
  outputTokens?: number;
  page: number;
  status: PageStatus;
}

export interface ConvertPdfOptions {
  density: number;
  format: "png" | "jpeg";
  height: number;
  preserveAspectRatio?: boolean;
  saveFilename: string;
  savePath: string;
}

export interface CompletionArgs {
  buffers: Buffer[];
  maintainFormat: boolean;
  priorPage: string;
  prompt?: string;
}

export interface CompletionResponse {
  content: string;
  inputTokens: number;
  logprobs?: TokenLogprob[] | null;
  outputTokens: number;
}

export type ProcessedCompletionResponse = Omit<
  CompletionResponse,
  "logprobs"
> & {
  contentLength: number;
};

export interface CreateModelArgs {
  credentials: unknown;
  llmParams: Partial<LLMParams>;
  model: Model;
  provider: ModelProviderType;
}

export enum ErrorMode {
  THROW = "THROW",
  IGNORE = "IGNORE",
}

export interface ExtractionArgs {
  input: string | string[] | HybridInput;
  options?: {
    correctOrientation?: boolean;
    scheduler: Tesseract.Scheduler | null;
    trimEdges?: boolean;
  };
  prompt?: string;
  schema: Record<string, unknown>;
}

export interface ExtractionResponse {
  extracted: Record<string, unknown>;
  inputTokens: number;
  logprobs?: TokenLogprob[] | null;
  outputTokens: number;
}

export type ProcessedExtractionResponse = Omit<ExtractionResponse, "logprobs">;

export interface HybridInput {
  imagePaths: string[];
  text: string;
}

interface BaseLLMParams {
  frequencyPenalty?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
}

export interface AzureLLMParams extends BaseLLMParams {
  logprobs: boolean;
  maxTokens: number;
}

export interface BedrockLLMParams extends BaseLLMParams {
  maxTokens: number;
}

export interface GoogleLLMParams extends BaseLLMParams {
  maxOutputTokens: number;
}

export interface OpenAILLMParams extends BaseLLMParams {
  logprobs: boolean;
  maxTokens: number;
}

export interface OpenRouterLLMParams extends BaseLLMParams {
  logprobs: boolean;
  maxTokens: number;
}

// Union type of all provider params
export type LLMParams =
  | AzureLLMParams
  | BedrockLLMParams
  | GoogleLLMParams
  | OpenAILLMParams
  | OpenRouterLLMParams;

export interface LogprobPage {
  page: number | null;
  value: TokenLogprob[];
}

interface Logprobs {
  ocr: LogprobPage[] | null;
  extracted: LogprobPage[] | null;
}

export interface MessageContentArgs {
  input: string | string[] | HybridInput;
  options?: {
    correctOrientation?: boolean;
    scheduler: Tesseract.Scheduler | null;
    trimEdges?: boolean;
  };
}

export interface ModelInterface {
  getCompletion(
    mode: OperationMode,
    params: CompletionArgs | ExtractionArgs
  ): Promise<CompletionResponse | ExtractionResponse>;
}

export interface Summary {
  totalPages: number;
  ocr: {
    successful: number;
    failed: number;
  } | null;
  extracted: {
    successful: number;
    failed: number;
  } | null;
}

export interface ExcelSheetContent {
  content: string;
  contentLength: number;
  sheetName: string;
}

// AI SDK compatibility types - removed AISDKCredentials as it's no longer needed

// Unified LLM parameters for AI SDK
export interface UnifiedLLMParams {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  logprobs?: boolean;
}

// Generic logprob type to replace OpenAI-specific import
export interface TokenLogprob {
  token: string;
  logprob: number;
  bytes?: number[] | null;
  top_logprobs?: Array<{
    token: string;
    logprob: number;
    bytes?: number[] | null;
  }> | null;
}

// AI SDK model type
export type AIModel = LanguageModelV1;
