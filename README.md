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

### Requirements

This uses `graphicsmagick` to turn each page into a png. You may need to run:

```sh
brew install graphicsmagick
```

### Example Output

```
add example here
```

### License

This project is licensed under the MIT License.
