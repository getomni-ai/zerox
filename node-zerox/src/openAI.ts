import axios from "axios";
import { CompletionArgs, CompletionResponse } from "./types";
import { encodeImageToBase64 } from "./utils";

export const getCompletion = async ({
  apiKey,
  imagePath,
  maintainFormat,
  priorPage,
}: CompletionArgs): Promise<CompletionResponse> => {
  const systemPrompt = `
    Convert the following PDF page to markdown.
    Return only the markdown with no explanation text.
    Do not exclude any content from the page.
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
        model: "gpt-4o-mini",
        temperature: 0,
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
