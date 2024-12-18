export interface ZeroxArgs {
  cleanup?: boolean;
  concurrency?: number;
  correctOrientation?: boolean;
  errorMode?: ErrorMode;
  filePath: string;
  imageDensity?: number;
  imageHeight?: number;
  llmParams?: LLMParams;
  maintainFormat?: boolean;
  maxRetries?: number;
  maxTesseractWorkers?: number;
  model?: ModelOptions | string;
  onPostProcess?: (params: {
    page: Page;
    progressSummary: Summary;
  }) => Promise<void>;
  onPreProcess?: (params: {
    imagePath: string;
    pageNumber: number;
  }) => Promise<void>;
  openaiAPIKey?: string;
  outputDir?: string;
  pagesToConvertAsImages?: number | number[];
  tempDir?: string;
  trimEdges?: boolean;
}

export type ModelOptions = "gpt-4o" | "gpt-4o-mini";

export enum PageStatus {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
}

export interface Page {
  content: string;
  contentLength: number;
  page: number;
  status: PageStatus;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ZeroxOutput {
  completionTime: number;
  fileName: string;
  inputTokens: number;
  outputTokens: number;
  pages: Page[];
  summary: Summary;
}

export interface CompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionArgs {
  apiKey: string;
  image: Buffer;
  llmParams?: LLMParams;
  maintainFormat: boolean;
  model: ModelOptions | string;
  priorPage: string;
}

export enum ErrorMode {
  THROW = "THROW",
  IGNORE = "IGNORE",
}

export interface LLMParams {
  frequencyPenalty?: number;
  maxTokens?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
}

export interface Summary {
  numPages: number;
  numSuccessfulPages: number;
  numFailedPages: number;
}
