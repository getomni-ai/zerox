export const camelToSnakeCase = (str: string) =>
  str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);

export const convertKeysToSnakeCase = (
  obj: Record<string, any> | null
): Record<string, any> => {
  if (typeof obj !== "object" || obj === null) {
    return obj ?? {};
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [camelToSnakeCase(key), value])
  );
};

export const isString = (value: string | null): value is string => {
  return value !== null;
};

export const isValidUrl = (string: string): boolean => {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
};

// Strip out the ```markdown wrapper
export const formatMarkdown = (text: string): string => {
  let formatted = text?.trim();
  let loopCount = 0;
  const maxLoops = 3;

  const startsWithHtml = formatted.startsWith("```html");
  const startsWithMarkdown = formatted.startsWith("```markdown");
  while ((startsWithHtml || startsWithMarkdown) && loopCount < maxLoops) {
    const endsWithClosing = formatted.endsWith("```");

    if ((startsWithHtml || startsWithMarkdown) && endsWithClosing) {
      const outerBlockRegex = /^```(html|markdown)\n([\s\S]*?)\n```$/;
      const match = outerBlockRegex.exec(formatted);

      if (match) {
        formatted = match[1].trim();
        loopCount++;
      } else {
        break;
      }
    } else {
      break;
    }
  }

  return formatted;
};

export const runRetries = async <T>(
  operation: () => Promise<T>,
  maxRetries: number,
  pageNumber: number
): Promise<T> => {
  let retryCount = 0;
  while (retryCount <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      if (retryCount === maxRetries) {
        throw error;
      }
      console.log(`Retrying page ${pageNumber}...`);
      retryCount++;
    }
  }
  throw new Error("Unexpected retry error");
};

export const splitSchema = (
  schema: Record<string, unknown>,
  extractPerPage?: string[]
): {
  fullDocSchema: Record<string, unknown> | null;
  perPageSchema: Record<string, unknown> | null;
} => {
  if (!extractPerPage?.length) {
    return { fullDocSchema: schema, perPageSchema: null };
  }

  const fullDocSchema: Record<string, unknown> = {};
  const perPageSchema: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema.properties || {})) {
    (extractPerPage.includes(key) ? perPageSchema : fullDocSchema)[key] = value;
  }

  const requiredKeys = Array.isArray(schema.required) ? schema.required : [];

  return {
    fullDocSchema: Object.keys(fullDocSchema).length
      ? {
          type: schema.type,
          properties: fullDocSchema,
          required: requiredKeys.filter((key) => !extractPerPage.includes(key)),
        }
      : null,
    perPageSchema: Object.keys(perPageSchema).length
      ? {
          type: schema.type,
          properties: perPageSchema,
          required: requiredKeys.filter((key) => extractPerPage.includes(key)),
        }
      : null,
  };
};
