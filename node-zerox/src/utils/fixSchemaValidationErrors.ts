import { formatJsonValue } from "../utils";
import { JSONSchema } from "openai/lib/jsonschema";
import { ZodError } from "zod";

/**
 * Handles specific cases of ZodError by traversing the
 * error paths in the original value and modifying invalid entries (e.g., replacing
 * invalid enum values with null or converting strings to booleans or numbers)
 *
 * Handled cases:
 * - Boolean strings ("true" or "false") should be converted to actual booleans
 * - Numeric strings (e.g., "123") should be converted to numbers
 * - For other cases, default to the default value or null
 *
 * @param {ZodError} err - The error object containing validation details
 * @returns {any} - The modified value object with resolved issues
 */
export const fixSchemaValidationErrors = ({
  err,
  schema,
  value: originalValue,
}: {
  err: ZodError<Record<string, any>>;
  schema: JSONSchema;
  value: Record<string, any>;
}) => {
  const errors = err.issues;
  let value = originalValue;

  errors.forEach((error) => {
    const lastKey = error.path[error.path.length - 1];

    let parent = value;
    for (let i = 0; i < error.path.length - 1; i++) {
      parent = parent?.[error.path[i]];
    }

    let defaultValue = null;
    if (schema) {
      let schemaProperty = schema;
      let properties = schemaProperty.properties || schemaProperty;

      for (const pathKey of error.path) {
        if (properties && properties[pathKey as keyof typeof properties]) {
          schemaProperty = properties[
            pathKey as keyof typeof properties
          ] as JSONSchema;
          properties = schemaProperty.properties || {};
        }
      }

      if (schemaProperty && "default" in schemaProperty) {
        defaultValue = schemaProperty.default;
      }
    }

    if (parent && typeof parent === "object") {
      const currentValue = parent[lastKey];

      if (
        error.code === "invalid_type" &&
        error.expected === "boolean" &&
        error.received === "string" &&
        (currentValue === "true" || currentValue === "false")
      ) {
        parent[lastKey] = currentValue === "true";
      } else if (
        error.code === "invalid_type" &&
        error.expected === "number" &&
        error.received === "string" &&
        !isNaN(Number(currentValue))
      ) {
        parent[lastKey] = Number(currentValue);
      } else if (
        error.code === "invalid_type" &&
        error.expected === "array" &&
        error.received === "string"
      ) {
        // TODO: could this be problematic? no check if the parsed array conformed to the schema
        const value = formatJsonValue(currentValue);
        if (Array.isArray(value)) {
          parent[lastKey] = value;
        }
      } else if (
        error.code === "invalid_type" &&
        (error.expected === "array" ||
          error.expected === "boolean" ||
          error.expected === "integer" ||
          error.expected === "number" ||
          error.expected === "string" ||
          error.expected.includes(" | ")) && // `Expected` for enums comes back as z.enum(['a', 'b']) => expected: "'a' | 'b'"
        currentValue === undefined
      ) {
        parent[lastKey] = defaultValue !== null ? defaultValue : null;
      }
      else {
        parent[lastKey] = defaultValue !== null ? defaultValue : null;
      }
    }
  });

  return value;
};
