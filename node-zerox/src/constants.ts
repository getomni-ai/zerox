// This is a rough guess; this will be used to create Tesseract workers by default,
// that cater to this many pages. If a document has more than this many pages,
// then more workers will be created dynamically.
export const NUM_STARTING_WORKERS = 3;

export const CONSISTENCY_PROMPT = (priorPage: string): string =>
  `Markdown must maintain consistent formatting with the following page: \n\n """${priorPage}"""`;

export const SYSTEM_PROMPT_BASE = `
  Convert the following PDF page to markdown.
  Return only the markdown with no explanation text. Do not include delimiters like '''markdown.
  You must include all information on the page. Do not exclude headers, footers, or subtext.
`;
