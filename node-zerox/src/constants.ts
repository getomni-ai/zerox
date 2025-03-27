export const ASPECT_RATIO_THRESHOLD = 5;

// This is a rough guess; this will be used to create Tesseract workers by default,
// that cater to this many pages. If a document has more than this many pages,
// then more workers will be created dynamically.
export const NUM_STARTING_WORKERS = 3;

export const CONSISTENCY_PROMPT = (priorPage: string): string =>
  `Markdown must maintain consistent formatting with the following page: \n\n """${priorPage}"""`;

export const SYSTEM_PROMPT_BASE = `
Convert the following document to markdown.
Return only the markdown with no explanation text. Do not include delimiters like \`\`\`markdown or \`\`\`html.

RULES:
  - You must include all information on the page. Do not exclude headers, footers, or subtext.
  - Return tables in an HTML format.
  - Charts & infographics must be interpreted to a markdown format. Prefer table format when applicable.
  - Logos should be wrapped in brackets. Ex: <logo>Coca-Cola<logo>
  - Watermarks should be wrapped in brackets. Ex: <watermark>OFFICIAL COPY<watermark>
  - Page numbers should be wrapped in brackets. Ex: <page_number>14<page_number> or <page_number>9/22<page_number>
  - Prefer using ☐ and ☑ for check boxes.
`;
