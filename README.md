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

| Service                                                                                                     | Cost                 | Accuracy | Table Quality |
| ----------------------------------------------------------------------------------------------------------- | -------------------- | -------- | ------------- |
| AWS Textract [[1]](https://aws.amazon.com/textract/pricing/#:~:text=Amazon%20Textract%20API%20pricing)      | $1.50 / 1,000 pages  | Low      | Low           |
| Google Document AI [[2]](https://cloud.google.com/document-ai/pricing)                                      | $1.50 / 1,000 pages  | Low      | Low           |
| Azure Document AI [[3]](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)        | $1.50 / 1,000 pages  | High     | Mid           |
| Unstructured (PDF) [[4]](https://unstructured.io/api-key-hosted#:~:text=Cost%20and%20Usage%20%0AGuidelines) | $10.00 / 1,000 pages | Mid      | Mid           |
| ------------------------                                                                                    | -------------------- | -------- | ------------- |
| Zerox (gpt-mini)                                                                                            | $ 4.00 / 1,000 pages | High     | High          |

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
  pagesToConvertAsImages: -1, // Page numbers to convert to image as array (e.g. `[1, 2, 3]`) or a number (e.g. `1`). Set to -1 to convert all pages.
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

### License

This project is licensed under the MIT License.
