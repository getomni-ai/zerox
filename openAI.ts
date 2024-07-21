import axios from "axios";
import { encodeImageToBase64 } from "./utils";

interface CompletionResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export const getCompletion = async ({
  priorPage,
  imagePath,
  apiKey,
  maintainFormat,
}: {
  priorPage: string;
  apiKey: string;
  imagePath: string;
  maintainFormat: boolean;
}): Promise<CompletionResponse> => {
  const systemPrompt = `
    Convert the following PDF page to markdown. 
    Return only the markdown with no explanation text. 
    Include all detail contained within the page.
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
        model: "gpt-4o-mini",
        messages,
        temperature: 0,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return {
      content: response.data.choices[0].message.content,
      inputTokens: response.data.usage.prompt_tokens,
      outputTokens: response.data.usage.completion_tokens,
    };
  } catch (err) {
    console.error("Error in OpenAI completion");
    throw err;
  }
};
