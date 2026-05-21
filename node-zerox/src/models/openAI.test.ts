import axios from "axios";
import OpenAIModel from "./openAI";
import { OperationMode, OpenAICredentials } from "../types";

jest.mock("axios");
jest.mock("../utils", () => ({
  cleanupImage: jest.fn(async ({ imageBuffer }) => [imageBuffer]),
  convertKeysToCamelCase: jest.fn((value) => value),
  convertKeysToSnakeCase: jest.fn((value) => value ?? {}),
  encodeImageToBase64: jest.fn(() => "encoded-image"),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockCompletionResponse = {
  data: {
    choices: [
      {
        message: {
          content: "markdown",
        },
      },
    ],
    usage: {
      completion_tokens: 5,
      prompt_tokens: 10,
    },
  },
};

const mockExtractionResponse = {
  data: {
    choices: [
      {
        message: {
          content: '{"field":"value"}',
        },
      },
    ],
    usage: {
      completion_tokens: 3,
      prompt_tokens: 7,
    },
  },
};

describe("OpenAIModel", () => {
  beforeEach(() => {
    mockedAxios.post.mockReset();
  });

  it("uses the default OpenAI chat completions endpoint for OCR", async () => {
    mockedAxios.post.mockResolvedValueOnce(mockCompletionResponse);
    const model = new OpenAIModel({ apiKey: "openai-key" }, "gpt-4o");

    await model.getCompletion(OperationMode.OCR, {
      buffers: [Buffer.from("image")],
      maintainFormat: false,
      priorPage: "",
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({ model: "gpt-4o" }),
      expect.any(Object)
    );
  });

  it("uses a custom OpenAI-compatible base URL for OCR", async () => {
    mockedAxios.post.mockResolvedValueOnce(mockCompletionResponse);
    const model = new OpenAIModel(
      {
        apiKey: "test-qianfan-key",
        baseUrl: "https://qianfan.baidubce.com/v2",
      },
      "ernie-4.5-vl-28b-a3b"
    );

    await model.getCompletion(OperationMode.OCR, {
      buffers: [Buffer.from("image")],
      maintainFormat: false,
      priorPage: "",
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://qianfan.baidubce.com/v2/chat/completions",
      expect.objectContaining({ model: "ernie-4.5-vl-28b-a3b" }),
      expect.any(Object)
    );
  });

  it("normalizes a trailing slash in the custom base URL", async () => {
    mockedAxios.post.mockResolvedValueOnce(mockCompletionResponse);
    const model = new OpenAIModel(
      {
        apiKey: "test-qianfan-key",
        baseUrl: "https://qianfan.baidubce.com/v2/",
      },
      "ernie-4.5-vl-28b-a3b"
    );

    await model.getCompletion(OperationMode.OCR, {
      buffers: [Buffer.from("image")],
      maintainFormat: false,
      priorPage: "",
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://qianfan.baidubce.com/v2/chat/completions",
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("uses the custom OpenAI-compatible base URL for extraction", async () => {
    mockedAxios.post.mockResolvedValueOnce(mockExtractionResponse);
    const model = new OpenAIModel(
      {
        apiKey: "test-qianfan-key",
        baseUrl: "https://qianfan.baidubce.com/v2",
      },
      "ernie-4.5-vl-28b-a3b"
    );

    await model.getCompletion(OperationMode.EXTRACTION, {
      input: "markdown content",
      schema: {
        properties: {
          field: { type: "string" },
        },
        type: "object",
      },
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://qianfan.baidubce.com/v2/chat/completions",
      expect.objectContaining({
        model: "ernie-4.5-vl-28b-a3b",
        response_format: expect.any(Object),
      }),
      expect.any(Object)
    );
  });

  it("keeps baseUrl optional for OpenAI credentials", () => {
    const credentials: OpenAICredentials = { apiKey: "openai-key" };

    expect(credentials).toEqual({ apiKey: "openai-key" });
  });
});
