## zerox ocr

This is a dead simple way of OCR-ing a document for AI ingestion. Literally just grabbing one page at a time, turning it into an image, and asking GPT to turn the image into markdown.

Sounds pretty dumb! But with the `gpt-4o-mini` release this method is only slightly more expensive than tools like AWS Textract or Unstructured. And it works with any type of document.

The general logic is pretty much:

- Pass in a pdf (url or buffer)
- Turn the pdf into a series of images
- Pass each image to GPT and ask nicely for markdown
- Aggregate the responses and return markdown

### Installation

```sh
npm install zerox-ocr
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
	tempDir: // Directory to use for temporary files (default: system temp directory)
});
```

### Example Output

```
add example here
```

### License

This project is licensed under the MIT License.
