import { z } from "zod";

/**
 * Pure helpers that turn the type editor's editable field list into the portable
 * JSON Schema stored on a {@link NodeTypeDefinition}. The editor lives in the UI
 * layer; these helpers live in the schema layer so the produced `jsonSchema` can
 * be unit-tested without React, and so any future non-UI caller (import, headless
 * authoring) can build a type from the same field shape.
 */

/**
 * A single user-authored field, as edited in the type editor. Each field maps to
 * one property on the node type's `data` object.
 */
export interface FieldDefinition {
  /** Property name on `data`; must be unique within a type. */
  name: string;
  /** JSON-Schema type, or an enum constrained to `options`. */
  type: "string" | "number" | "boolean" | "enum";
  /** Enum values; required iff `type` is "enum". */
  options?: string[];
}

/** A JSON Schema object — the portable form stored on a NodeTypeDefinition. */
export type JsonObject = Record<string, unknown>;

/**
 * Build the Zod type for a single field. `z.enum` (Zod 4) accepts a plain string
 * array, so the enum's options flow straight through without a tuple cast; an
 * empty array would produce a type nothing can satisfy, so it is rejected loudly
 * here rather than silently authoring a broken schema.
 */
function fieldZodType(field: FieldDefinition): z.ZodType {
  switch (field.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "enum":
      if (field.options === undefined || field.options.length === 0) {
        throw new Error(`Enum field "${field.name}" must declare at least one option`);
      }
      return z.enum(field.options);
  }
}

/**
 * Build a portable JSON Schema (draft 2020-12) from a list of field definitions.
 * A Zod object schema is constructed (the single source of truth) and projected
 * via `z.toJSONSchema`, so the output round-trips cleanly through
 * `z.fromJSONSchema` in the type registry — the same projection built-in types
 * use. Every field is required and additional properties are forbidden, matching
 * the built-in types' shapes.
 */
export function buildJsonSchemaFromFields(fields: FieldDefinition[]): JsonObject {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.name] = fieldZodType(field);
  }
  return z.toJSONSchema(z.object(shape).strict());
}
