import { z } from "zod";
import { fixSchemaValidationErrors } from "./fixSchemaValidationErrors";

const zodTypeMapping = {
  array: (itemSchema: any) => z.array(itemSchema),
  boolean: z.boolean(),
  integer: z.number().int(),
  number: z.number(),
  object: (properties: any) => z.object(properties).strict(),
  string: z.string(),
};

export const generateZodSchema = (schemaDef: any): z.ZodObject<any> => {
  const properties: Record<string, any> = {};

  for (const [key, value] of Object.entries(schemaDef.properties) as any) {
    let zodType;

    if (value.enum && Array.isArray(value.enum) && value.enum.length > 0) {
      zodType = z.enum(value.enum as [string, ...string[]]);
    } else {
      // @ts-ignore
      zodType = zodTypeMapping[value.type];
    }

    if (value.type === "array" && value.items.type === "object") {
      properties[key] = zodType(generateZodSchema(value.items));
    } else if (value.type === "array" && value.items.type !== "object") {
      // @ts-ignore
      properties[key] = zodType(zodTypeMapping[value.items.type]);
    } else if (value.type === "object") {
      properties[key] = generateZodSchema(value);
    } else {
      properties[key] = zodType;
    }

    // Make properties nullable by default
    properties[key] = properties?.[key]?.nullable();

    if (value.description) {
      properties[key] = properties?.[key]?.describe(value?.description);
    }
  }

  return z.object(properties).strict();
};

export const validate = ({
  schema,
  value,
}: {
  schema: Record<string, unknown>;
  value: unknown;
}) => {
  const zodSchema = generateZodSchema(schema);

  const result = zodSchema.safeParse(value);
  if (result.success) return { value: result.data, issues: [] };

  const fixedData = fixSchemaValidationErrors({
    err: result.error,
    schema,
    value: value as Record<string, unknown>,
  });

  return { issues: result.error.issues, value: fixedData };
};
