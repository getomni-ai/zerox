import { CompletionArgs, CompletionResponse, ProviderOptions } from "./types";
import { convertKeysToSnakeCase, encodeImageToBase64 } from "./utils";
import axios from "axios";

export const getCompletion = async ({
  apiKey,
  imagePath,
  llmParams,
  maintainFormat,
  model,
  priorPage,
  provider = ProviderOptions.openai,
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
