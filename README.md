## OCR

> "If it's stupid, but it works, it's not stupid"

This is a dead simple way of OCR-ing a document for AI igestion. Literally just grabbing one page at a time, turning it into an image, and asking GPT to turn the image into markdown.

Sounds pretty dumb! But with the `gpt-4o-mini` release this method is only slightly more expensive than tools like AWS Textract or Unstructured. And it works with any type of document.

The general logic is pretty much:

- Pass in a file
- If the file is not a pdf, turn it into one
- Turn the pdf into a series of images
- Pass each image to GPT and ask nicely for markdown
- Aggregate the responses and return markdown

For documents that have a `consistantFormatting` option.

```ts
// Synchronous execution (for smaller documents)
const result = await obliterate({
  filePath: "path/to/file",
  consistantFormatting: false,
  openAIApiKey: process.env.OPENAI_API_KEY,
});
```

```ts
// Synchronous execution (for smaller documents)
const result = await obliterate({
  filePath: "path/to/file",
  outputDir: "output/path",
  consistantFormatting: false,
  openAIApiKey: process.env.OPENAI_API_KEY,
});
```
