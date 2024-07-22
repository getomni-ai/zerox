export interface ZeroxArgs {
  cleanup?: boolean;
  concurrency?: number;
  filePath: string;
  maintainFormat?: boolean;
  openaiAPIKey?: string;
  outputDir?: string;
  tempDir?: string;
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
  priorPage: string;
}
