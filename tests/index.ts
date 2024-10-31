import { zerox } from "../node-zerox/src";
import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import pLimit from "p-limit";

import input from "./input.json";

const FILE_CONCURRENCY = 1;

async function main() {
  const limit = pLimit(FILE_CONCURRENCY);
  const userArg = process.argv[2];
  let title = "";
  let description = "";

  if (userArg) {
    console.log(`Argument provided: ${userArg}`, process.argv);
  } else {
    const response = await prompts([
      {
        type: "text",
        name: "title",
        message: "Please enter a title:",
      },
      {
        type: "text",
        name: "description",
        message: "Please enter a description (optional):",
      },
    ]);

    title = response.title;
    description = response.description;
  }

  const folderName = title.slice(0, 50) + "-" + Date.now();
  const outputDir = path.join("tests", "results", folderName);
  fs.mkdirSync(outputDir);

  const results = await Promise.all(
    input.map((i) =>
      limit(async () => {
        return zerox({
          filePath: path.join("tests", "documents", i.name),
          outputDir,
          openaiAPIKey: process.env.OPENAI_API_KEY,
        });
      })
    )
  );

  const output = results.map((r, idx) => {
    const i = input[idx];
    let totalWords = 0;

    const keywordStatus = i.expectedKeywords.map((keywordsPerPage, idx) => {
      const page = r.pages[idx];
      let keywordAbsent = 0,
        keywordPresent = 0;

      keywordsPerPage.forEach((k) => {
        const splittedContent = page.content.toLowerCase().split(" ");
        totalWords += splittedContent.length;

        new Set(splittedContent).has(k.toLowerCase())
          ? keywordPresent++
          : keywordAbsent++;
      });

      return { keywordAbsent, keywordPresent };
    });

    const t: any = { ...r };
    delete t["pages"];

    return {
      keywords: keywordStatus,
      ...t,
    };
  });

  const toWrite = {
    title,
    description,
    output,
  };

  fs.writeFileSync(
    path.join(outputDir, "output.json"),
    JSON.stringify(toWrite, null, 2)
  );

  console.log(`Test run complete, results are in ${outputDir}`);
}

main();
