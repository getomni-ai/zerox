![Hero Image](./examples/heroImage.png)

## Zerox OCR

A dead simple way of OCR-ing a document for AI ingestion. Documents are meant to be a visual representation after all. With weird layouts, tables, charts, etc. The vision models just make sense!

The general logic:

- Pass in a PDF (URL or file buffer)
- Turn the PDF into a series of images
- Pass each image to GPT and ask nicely for Markdown
- Aggregate the responses and return Markdown

Sounds pretty basic! But with the `gpt-4o-mini` this method is price competitive with existing products, with meaningfully better results.

#### Pricing Comparison

This is how the pricing stacks up to other document processers. Running 1,000 pages with Zerox uses about 25M input tokens and 0.4M output tokens.

| Service                                                                                                 | Cost                 | Accuracy | Table Quality |
| ------------------------------------------------------------------------------------------------------- | -------------------- | -------- | ------------- |
| AWS Textract[[1]](https://aws.amazon.com/textract/pricing/#:~:text=Amazon%20Textract%20API%20pricing)      | $1.50 / 1,000 pages  | Low      | Low           |
| Google Document AI[[2]](https://cloud.google.com/document-ai/pricing)                                      | $1.50 / 1,000 pages  | Low      | Low           |
| Azure Document AI[[3]](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)        | $1.50 / 1,000 pages  | High     | Mid           |
| Unstructured (PDF)[[4]](https://unstructured.io/api-key-hosted#:~:text=Cost%20and%20Usage%20%0AGuidelines) | $10.00 / 1,000 pages | Mid      | Mid           |
| ------------------------                                                                                | -------------------- | -------- | ------------- |
| Zerox (gpt-mini)                                                                                        | $ 4.00 / 1,000 pages | High     | High          |

## Installation

```sh
npm install zerox
```

Zerox uses `graphicsmagick` and `ghostscript` for the pdf => image processing step. These should be pulled automatically, but you may need to manually install.

## Usage

**With file URL**

```ts
import { zerox } from "zerox";

const result = await zerox({
  filePath: "https://omni-demo-data.s3.amazonaws.com/test/cs101.pdf",
  openaiAPIKey: process.env.OPENAI_API_KEY,
});
```

**From local path**

```ts
import path from "path";
import { zerox } from "zerox";

const result = await zerox({
  filePath: path.resolve(__dirname, "./cs101.pdf"),
  openaiAPIKey: process.env.OPENAI_API_KEY,
});
```

### Options

```ts
const result = await zerox({
  // Required
  filePath: "path/to/file",
  openaiAPIKey: process.env.OPENAI_API_KEY,

  // Optional
  cleanup: true, // Clear images from tmp after run.
  concurrency: 10, // Number of pages to run at a time.
  maintainFormat: false, // Slower but helps maintain consistent formatting.
  model: 'gpt-4o-mini' // Model to use (gpt-4o-mini or gpt-4o).
  outputDir: undefined, // Save combined result.md to a file.
  tempDir: "/os/tmp", // Directory to use for temporary files (default: system temp directory).
});
```

The `maintainFormat` option trys to return the markdown in a consistent format by passing the output of a prior page in as additional context for the next page. This requires the requests to run synchronously, so it's a lot slower. But valuable if your documents have a lot of tabular data, or frequently have tables that cross pages.

```
Request #1 => page_1_image
Request #2 => page_1_markdown + page_2_image
Request #3 => page_2_markdown + page_3_image
```

### Example Output

```js
{
  completionTime: 10038,
  fileName: 'invoice_36258',
  inputTokens: 25543,
  outputTokens: 210,
  pages: [
    {
      content: '# INVOICE # 36258\n' +
        '**Date:** Mar 06 2012  \n' +
        '**Ship Mode:** First Class  \n' +
        '**Balance Due:** $50.10  \n' +
        '## Bill To:\n' +
        'Aaron Bergman  \n' +
        '98103, Seattle,  \n' +
        'Washington, United States  \n' +
        '## Ship To:\n' +
        'Aaron Bergman  \n' +
        '98103, Seattle,  \n' +
        'Washington, United States  \n' +
        '\n' +
        '| Item                                       | Quantity | Rate   | Amount  |\n' +
        '|--------------------------------------------|----------|--------|---------|\n' +
        "| Global Push Button Manager's Chair, Indigo | 1        | $48.71 | $48.71  |\n" +
        '| Chairs, Furniture, FUR-CH-4421             |          |        |         |\n' +
        '\n' +
        '**Subtotal:** $48.71  \n' +
        '**Discount (20%):** $9.74  \n' +
        '**Shipping:** $11.13  \n' +
        '**Total:** $50.10  \n' +
        '---\n' +
        '**Notes:**  \n' +
        'Thanks for your business!  \n' +
        '**Terms:**  \n' +
        'Order ID : CA-2012-AB10015140-40974  ',
      page: 1,
      contentLength: 747
    }
  ]
}
```

## Usage (Python SDK - supports vision models from different providers like OpenAI, Azure OpenAI, Anthropic, AWS Bedrock etc)

```python
from py_zerox import zerox
import os
import json
import asyncio

### Model Setup (Use only Vision Models) Refer: https://docs.litellm.ai/docs/providers ###

kwargs = {}

###################### Example for OpenAI ######################
model = "gpt-4o-mini" ## openai model
os.environ["OPENAI_API_KEY"] = "" ## your-api-key


###################### Example for Azure OpenAI ######################
model = "azure/gpt-4o-mini" ## "azure/<your_deployment_name>" -> format <provider>/<model>
os.environ["AZURE_API_KEY"] = "" # "your-azure-api-key"
os.environ["AZURE_API_BASE"] = "" # "https://example-endpoint.openai.azure.com"
os.environ["AZURE_API_VERSION"] = "" # "2023-05-15"


###################### Example for Gemini ######################
model = "gemini/gpt-4o-mini" ## "gemini/<gemini_model>" -> format <provider>/<model>
os.environ['GEMINI_API_KEY'] = "" # your-gemini-api-key


###################### Example for Anthropic ######################
model="claude-3-opus-20240229"
os.environ["ANTHROPIC_API_KEY"] = "" # your-anthropic-api-key

###################### Google Vertex ai ######################
model = "gemini-1.5-flash-001"
## GET CREDENTIALS 
## RUN ## 
# !gcloud auth application-default login - run this to add vertex credentials to your env
## OR ## 
file_path = 'path/to/vertex_ai_service_account.json'

# Load the JSON file
with open(file_path, 'r') as file:
    vertex_credentials = json.load(file)

# Convert to JSON string
vertex_credentials_json = json.dumps(vertex_credentials)

vertex_credentials=vertex_credentials_json

## extra args
kwargs = {"vertex_credentials": vertex_credentials}

###################### For other providers refer: https://docs.litellm.ai/docs/providers ######################

# Define main async entrypoint
async def main():
    file_path = "https://omni-demo-data.s3.amazonaws.com/test/cs101.pdf" ## local filepath and file URL supported
    output_dir = "./output_test"
    result = await zerox.zerox(file_path=file_path, model=model, output_dir=output_dir, **kwargs)
    return result


# run the main function:
result = asyncio.run(main())

# print markdown result
print(result)
```

### Example Output (Output from "azure/gpt-4o-mini"):

```console
ZeroxOutput(completion_time=21192.572, file_name='cs101', input_tokens=0, output_tokens=0, pages=[Page(content='# 26.3. Variables\n\n| Type    | Description                                 | Wrapper Class |\n|---------|---------------------------------------------|---------------|\n| byte    | 8-bit signed 2s complement integer         | Byte          |\n| short   | 16-bit signed 2s complement integer        | Short         |\n| int     | 32-bit signed 2s complement integer        | Integer       |\n| long    | 64-bit signed 2s complement integer        | Long          |\n| float   | 32-bit IEEE 754 floating point number      | Float         |\n| double  | 64-bit floating point number                | Double        |\n| boolean | may be set to true or false                 | Boolean       |\n| char    | 16-bit Unicode (UTF-16) character          | Character     |\n\n**Table 26.2:** Primitive types in Java\n\n## 26.3.1. Declaration & Assignment\n\nJava is a statically typed language meaning that all variables must be declared before you can use them or refer to them. In addition, when declaring a variable, you must specify both its type and its identifier. For example:\n\n```java\nint numUnits;\ndouble costPerUnit;\nchar firstInitial;\nboolean isStudent;\n```\n\nEach declaration specifies the variable’s type followed by the identifier and ending with a semicolon. The identifier rules are fairly standard: a name can consist of lowercase and uppercase alphabetic characters, numbers, and underscores but may not begin with a numeric character. We adopt the modern camelCasing naming convention for variables in our code. In general, variables must be assigned a value before you can use them in an expression. You do not have to immediately assign a value when you declare them (though it is good practice), but some value must be assigned before they can be used or the compiler will issue an error. \n\nThe assignment operator is a single equal sign, `=` and is a right-to-left assignment. That is, the variable that we wish to assign the value to appears on the left-hand-side while the value (literal, variable or expression) is on the right-hand-size. Using our variables from before, we can assign them values:\n\n> Instance variables, that is variables declared as part of an object do have default values. For objects, the default is `null`, for all numeric types, zero is the default value. For the boolean type, `false` is the default, and the default `char` value is `\\0`, the null-terminating character (zero in the ASCII table).', content_length=2420, page=1)])
```

### Python API doc

## `zerox` Function

The `zerox` function is an asynchronous API that performs OCR (Optical Character Recognition) to markdown using vision models. It processes PDF files and converts them into markdown format. Make sure to set up the environment variables for the model and the model provider before using this API.

Refer to the [LiteLLM Documentation](https://docs.litellm.ai/docs/providers) for setting up the environment and passing the correct model name.

### Function Signature

```python
async def zerox(
    cleanup: bool = True,
    concurrency: int = 10,
    file_path: Optional[str] = "",
    maintain_format: bool = False,
    model: str = "gpt-4o-mini",
    output_dir: Optional[str] = None,
    temp_dir: str = tempfile.gettempdir(),
    **kwargs
) -> ZeroxOutput:
  ...
```

Parameters

- cleanup (bool, optional):
  Whether to clean up temporary files after processing. Defaults to True.
- concurrency (int, optional):
  The number of concurrent processes to run. Defaults to 10.
- file_path (Optional[str], optional):
  The path to the PDF file to process. Defaults to an empty string.
- maintain_format (bool, optional):
  Whether to maintain the format from the previous page. Defaults to False.
- model (str, optional):
  The model to use for generating completions. Defaults to "gpt-4o-mini".
  Refer to LiteLLM Providers for the correct model name, as it may differ depending on the provider.
- output_dir (Optional[str], optional):
  The directory to save the markdown output. Defaults to None.
- temp_dir (str, optional):
  The directory to store temporary files. Defaults to the system's temporary directory (tempfile.gettempdir()).
- kwargs (dict, optional):
  Additional keyword arguments to pass to the litellm.completion method.
  Refer to the LiteLLM Documentation and Completion Input for details.

Returns

- ZeroxOutput:
  The markdown content generated by the model.

### License

This project is licensed under the MIT License.
