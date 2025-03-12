export const camelToSnakeCase = (str: string) =>
  str.replace(/[A-Z]/g, (letter: string) => `_${letter.toLowerCase()}`);

export const convertKeysToCamelCase = (
  obj: Record<string, any> | null
): Record<string, any> => {
  if (typeof obj !== "object" || obj === null) {
    return obj ?? {};
  }

  if (Array.isArray(obj)) {
    return obj.map(convertKeysToCamelCase);
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      snakeToCamelCase(key),
      convertKeysToCamelCase(value),
    ])
  );
};

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
  return (
    text
      // First preserve all language code blocks except html and markdown
      .replace(/```(?!html|markdown)(\w+)([\s\S]*?)```/g, "§§§$1$2§§§")
      // Then remove html and markdown code markers
      .replace(/```(?:html|markdown)|````(?:html|markdown)|```/g, "")
      // Finally restore all preserved language blocks
      .replace(/§§§(\w+)([\s\S]*?)§§§/g, "```$1$2```")
  );
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

export const snakeToCamelCase = (str: string): string =>
  str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

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
