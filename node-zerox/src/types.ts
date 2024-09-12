export interface ZeroxArgs {
  cleanup?: boolean;
  concurrency?: number;
  filePath: string;
  maintainFormat?: boolean;
  model?: ModelOptions;
  openaiAPIKey?: string;
  outputDir?: string;
  pagesToConvertAsImages?: number | number[];
  tempDir?: string;
}

export enum ModelOptions {
  gpt_4o = "gpt-4o",
  gpt_4o_mini = "gpt-4o-mini",
}

export interface Page {
  content: string;
  contentLength: number;
  page: number;
}

export interface ZeroxOutput {
  completionTime: number;
  fileName: string;
  inputTokens: number;
  outputTokens: number;
  pages: Page[];
}

export interface CompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionArgs {
  apiKey: string;
  imagePath: string;
  maintainFormat: boolean;
  model: ModelOptions;
  priorPage: string;
}
