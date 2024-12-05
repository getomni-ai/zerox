export interface ZeroxArgs {
  chunk?: boolean;
  cleanup?: boolean;
  concurrency?: number;
  correctOrientation?: boolean;
  filePath: string;
  imageDensity?: number;
  imageHeight?: number;
  llmParams?: LLMParams;
  maintainFormat?: boolean;
  maxTesseractWorkers?: number;
  model?: ModelOptions | string;
  onPostProcess?: (params: {
    content: string;
    pageNumber: number;
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

export enum ModelOptions {
  gpt_4o = "gpt-4o",
  gpt_4o_mini = "gpt-4o-mini",
}

export interface Page {
  chunks: ProcessedNode[];
  content: string;
  contentLength: number;
  page: number;
}

export interface ZeroxOutput {
  chunks: ProcessedNode[];
  completionTime: number;
  fileName: string;
  inputTokens: number;
  outputTokens: number;
  pages: Page[];
}

export interface CompletionResponse {
  chunks: ProcessedNode[];
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionArgs {
  apiKey: string;
  chunk: boolean;
  imagePath: string;
  llmParams?: LLMParams;
  maintainFormat: boolean;
  model: ModelOptions | string;
  pageNumber: number;
  priorPage: string;
}

export interface LLMParams {
  frequencyPenalty?: number;
  maxTokens?: number;
  presencePenalty?: number;
  temperature?: number;
  topP?: number;
}

export type ProcessPageResponseBody = {
  chunks: ProcessedNode[];
  formattedMarkdown: string;
} | null;

// Source: https://github.com/syntax-tree/mdast?tab=readme-ov-file
export enum MdNodeType {
  blockquote = "blockquote",
  break = "break", // ignored
  code = "code",
  definition = "definition", // ignored
  emphasis = "emphasis",
  heading = "heading",
  html = "html",
  image = "image", // ignored
  imageReference = "imageReference", // ignored
  inlineCode = "inlineCode",
  link = "link",
  linkReference = "linkReference", // ignored
  list = "list",
  listItem = "listItem",
  paragraph = "paragraph",
  root = "root",
  strong = "strong",
  table = "table",
  tableCell = "tableCell",
  tableRow = "tableRow",
  text = "text",
  thematicBreak = "thematicBreak", // ignored
}

export enum ConvertedNodeType {
  heading = "heading",
  list = "list",
  table = "table",
  text = "text",
}
export interface BaseNode {
  id: string;
  page?: number;
  parentId?: string;
}

export interface TextNode extends BaseNode {
  type: ConvertedNodeType.text;
  value: string;
}

export interface HeadingNode extends BaseNode {
  type: ConvertedNodeType.heading;
  value: string;
}

export interface ListNode extends BaseNode {
  type: ConvertedNodeType.list;
  value: ListItem[];
}

export interface ListItem {
  id: string;
  value: string;
}

export interface TableNode extends BaseNode {
  type: ConvertedNodeType.table;
  value: {
    header: string[];
    rows: Record<string, string>[];
  };
}

export type ProcessedNode = HeadingNode | ListNode | TableNode | TextNode;

export interface ParentId {
  depth: number;
  id: string;
}
