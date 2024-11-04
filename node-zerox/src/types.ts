export interface ZeroxArgs {
  cleanup?: boolean;
  concurrency?: number;
  correctOrientation?: boolean;
  filePath: string;
  llmParams?: LLMParams;
  maintainFormat?: boolean;
  model?: ModelOptions | string;
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
  structuredContent: ProcessedNode[];
}

export interface CompletionArgs {
  apiKey: string;
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

export enum MdNodeType {
  break = "break",
  heading = "heading",
  list = "list",
  paragraph = "paragraph",
  strong = "strong",
  table = "table",
  text = "text",
  thematicBreak = "thematicBreak",
}

export enum ConvertedNodeType {
  heading = "heading",
  list = "list",
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

export type ProcessedNode = TextNode | HeadingNode | ListNode;

export interface ParentId {
  depth: number;
  id: string;
}
