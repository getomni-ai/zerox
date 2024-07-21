## Zerox OCR

A dead simple way of OCR-ing a document for AI ingestion.

The general logic:

- Pass in a PDF (URL or file buffer)
- Turn the PDF into a series of images
- Pass each image to GPT and ask nicely for markdown
- Aggregate the responses and return markdown

Sounds pretty basic! But with the `gpt-4o-mini` release this method is only slightly more expensive than tools like AWS Textract or Unstructured. And tends to give back better results.

Documents are meant to be a visual representation after all. With weird layouts, tables, charts, etc. The easiest solution

### Installation

```sh
npm install zerox
```

### Requirements

This uses `graphicsmagick` to turn each page into a png. You may need to run:

```sh
brew install graphicsmagick
```

### Usage

```ts
import { documentToMarkdown } from "zerox-ocr";

const result = await zerox({
  filePath: "path/to/file",
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
  concurrency: 10, // Number of pages to run at a time.
  maintainFormat: false, // Slower but helps maintain consistent formatting.
  cleanup: true, // Clear images from tmp after run.
  outputDir: undefined, // Save combined result.md to a file
  tempDir: "/os/tmp", // Directory to use for temporary files (default: system temp directory)
});
```

The `maintainFormat` option trys to return the markdown in a consistent format by passing the output of a prior page in as additional context for the next page. This requires the requests to run synchronously, so it's a lot slower. But valueable if your documents have a lot of tabular data, or frequently have tables that cross pages.

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
