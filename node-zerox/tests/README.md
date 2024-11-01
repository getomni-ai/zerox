# Test Script README

This script runs a quick test of the zerox output against a set keywords from known documents. This is not an exhaustive test, as it will not cover layout, but gives a good sense of any regressions.

## Overview

- **Processes Files**: Reads documents from `shared/inputs` (mix of PDFs, images, Word docs, etc.).
- **Runs OCR**: Runs `zerox` live against all the files.
- **Keyword Verification**: Compares extracted text with expected keywords from `shared/test.json`.
- **Results**: Outputs counts of keywords found and missing, and displays a summary table.

## How to Run

You should be able to run this test with `npm run test` from the root directory.

Note you will need a `.env` file in `node-zerox` with your OpenAI API key:

```
OPENAI_API_KEY=your_api_key_here
```

## Contributing new tests

1. **Add Your Document**:

   - Place the file in `shared/inputs` (e.g., `0005.pdf`).

2. **Update `test.json`**:

   - Add an entry:

     ```json
     {
       "file": "your_file.ext",
       "expectedKeywords": [
         ["keyword1_page1", "keyword2_page1"],
         ["keyword1_page2", "keyword2_page2"]
       ]
     }
     ```

3. **Run the Test**:

   - Execute the script to include the new file.
