// This is a rough guess; this will be used to create Tesseract workers by default,
// that cater to this many pages. If a document has more than this many pages,
// then more workers will be created dynamically.
export const NUM_STARTING_WORKERS = 3 * 4;
