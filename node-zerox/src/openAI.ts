import { CompletionArgs, CompletionResponse } from "./types";
import { convertKeysToSnakeCase, encodeImageToBase64 } from "./utils";
import axios from "axios";
import { nanoid } from "nanoid";

const markdownToJson = async (markdownString: string) => {
  /**
   * Bypassing typescript transpiler using eval to use dynamic imports
   * 
   * Source: https://stackoverflow.com/a/70546326
   */
  const { unified } = await eval(`import('unified')`);
  const { default: remarkParse } = await eval(`import('remark-parse')`);
  const { remarkGfm } = await eval(`import('remark-gfm')`);

  const parsedMd = unified()
    .use(remarkParse) // Parse Markdown to AST
    .use(remarkGfm)
    .parse(markdownString);

  const parentIdManager: string[] = [];

  let depths = [0];

  const jsonObj = parsedMd.children.map((node: any) => {
    const isHeading = node.type === "heading";
    if (isHeading && node.depth <= (depths.at(-1) || 0)) {
      parentIdManager.pop();
      // TODO: keep removing depth number till it reaches the one less than node.depth
      depths.pop();
    }
    const processedNode = processNode(node, parentIdManager.at(-1));

    if (isHeading) {
      parentIdManager.push(processedNode.id);
      if (depths.at(-1) !== node.depth) depths.push(node.depth);
    }

    return processedNode;
  });

  return jsonObj;
};

const type: Record<string, string> = {
  heading: "heading",
  text: "text",
};

const processNode = (node: any, parentId?: string) => {
  let value: any;

  if (node.type === "heading") {
    value = node.children
      .map((childNode: any) => processText(childNode))
      .join(" ");
  } else if (node.type === "paragraph") {
    value = node.children
      .map((childNode: any) => processText(childNode))
      .join(" ");
  }

  return {
    id: nanoid(),
    parentId,
    type: type[node.type as string] || type.text,
    value,
  };
};

const processText = (node: any) => {
  return node.value;
};

export const getCompletion = async ({
  apiKey,
  imagePath,
  llmParams,
  maintainFormat,
  model,
  priorPage,
}: CompletionArgs): Promise<CompletionResponse> => {
  const systemPrompt = `
    Convert the following PDF page to markdown.
    Return only the markdown with no explanation text. Do not include deliminators like '''markdown.
    You must include all information on the page. Do not exclude headers, footers, or subtext.
  `;

  // Default system message.
  const messages: any = [{ role: "system", content: systemPrompt }];

  // If content has already been generated, add it to context.
  // This helps maintain the same format across pages
  if (maintainFormat && priorPage && priorPage.length) {
    messages.push({
      role: "system",
      content: `Markdown must maintain consistent formatting with the following page: \n\n """${priorPage}"""`,
    });
  }

  // Add Image to request
  const base64Image = await encodeImageToBase64(imagePath);
  messages.push({
    role: "user",
    content: [
      {
        type: "image_url",
        image_url: { url: `data:image/png;base64,${base64Image}` },
      },
    ],
  });

  try {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        messages,
        model,
        ...convertKeysToSnakeCase(llmParams ?? null),
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = response.data;

    // const jsonOutput = await markdownToJson(data.choices[0].message.content);
    // console.log("====>>>>", JSON.stringify(jsonOutput, null, 2));

    return {
      content: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  } catch (err) {
    console.error("Error in OpenAI completion", err);
    throw err;
  }
};
