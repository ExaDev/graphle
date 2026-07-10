import { z } from "zod";

/**
 * Serialisable definition of an edge type, stored inside a graph document so a
 * loader can reconstruct per-type validation and presentation without an
 * external registry. Mirrors {@link NodeTypeDefinition}; edges have no identity
 * fields (dedup is keyed on `(source, target, type)`, not on `data`), and carry
 * `strokeStyle` instead of `icon` since an edge renders as a line, not a badge.
 */
export const EdgeTypeDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  color: z.string(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]),
  /** Field on `data` whose value is shown as the edge's label. */
  labelField: z.string(),
  jsonSchema: z.record(z.string(), z.unknown()),
});
export type EdgeTypeDefinition = z.infer<typeof EdgeTypeDefinitionSchema>;

/**
 * An edge type at runtime: the serialisable definition plus the live Zod
 * schema that validates edge `data`. Built-in types carry their original Zod
 * object schema; custom types carry one reconstructed from `jsonSchema`.
 */
export interface RuntimeEdgeType extends EdgeTypeDefinition {
  schema: z.ZodType;
}

/** Inputs to {@link defineBuiltInEdgeType}: metadata plus the live Zod data schema. */
export interface DefineBuiltInEdgeTypeConfig {
  name: string;
  label: string;
  color: string;
  strokeStyle: "solid" | "dashed" | "dotted";
  labelField: string;
  schema: z.ZodObject<z.ZodRawShape>;
}

/**
 * Register a built-in edge type. Stores the Zod schema for runtime validation
 * and derives the serialisable `jsonSchema` via `z.toJSONSchema` so the type
 * can be persisted and reconstructed without the original Zod definition.
 */
export function defineBuiltInEdgeType(
  config: DefineBuiltInEdgeTypeConfig,
): RuntimeEdgeType {
  return {
    name: config.name,
    label: config.label,
    color: config.color,
    strokeStyle: config.strokeStyle,
    labelField: config.labelField,
    jsonSchema: z.toJSONSchema(config.schema),
    schema: config.schema,
  };
}

/**
 * Project a runtime edge type to its serialisable form by dropping the live
 * Zod `schema`. The remaining fields (including `jsonSchema`) are exactly what
 * a document persists; the projection is reversed on load via
 * {@link zodSchemaForEdgeType}, which recovers a Zod schema from `jsonSchema`.
 */
export function toPortableEdgeTypeDefinition(
  type: RuntimeEdgeType,
): EdgeTypeDefinition {
  return {
    name: type.name,
    label: type.label,
    color: type.color,
    strokeStyle: type.strokeStyle,
    labelField: type.labelField,
    jsonSchema: type.jsonSchema,
  };
}
