import { Page } from "../src/types";

export const compareKeywords = (
  pages: Page[],
  expectedKeywords: string[][]
) => {
  const keywordCounts: {
    keywordsFound: string[];
    keywordsMissing: string[];
    page: number;
    totalKeywords: number;
  }[] = [];

  for (let i = 0; i < expectedKeywords.length; i++) {
    const page = pages[i];
    const keywords = expectedKeywords[i];
    const keywordsFound: string[] = [];
    const keywordsMissing: string[] = [];

    if (page && keywords && page.content !== undefined) {
      const pageContent = page.content.toLowerCase();

      keywords.forEach((keyword) => {
        if (pageContent.includes(keyword.toLowerCase())) {
          keywordsFound.push(keyword);
        } else {
          keywordsMissing.push(keyword);
        }
      });
    }

    keywordCounts.push({
      keywordsFound,
      keywordsMissing,
      page: i + 1,
      totalKeywords: keywords.length,
    });
  }

  return keywordCounts;
};
