import { z } from "zod";

/**
 * Serialisable definition of a node type, stored inside a graph document so a
 * loader can reconstruct per-type validation without an external registry. The
 * `jsonSchema` field is a standard JSON Schema (draft 2020-12) produced via
 * `z.toJSONSchema`; built-in types additionally keep a live Zod schema in the
 * runtime registry (see {@link RuntimeNodeType}) for richer validation.
 */
export const NodeTypeDefinitionSchema = z.object({
  name: z.string(),
  label: z.string(),
  color: z.string(),
  icon: z.string(),
  /** Field on `data` whose value is shown as the node's primary label. */
  labelField: z.string(),
  /** Fields that together identify a node of this type (for dedupe/merge). */
  identityFields: z.array(z.string()),
  jsonSchema: z.record(z.string(), z.unknown()),
});
export type NodeTypeDefinition = z.infer<typeof NodeTypeDefinitionSchema>;

/**
 * A node type at runtime: the serialisable definition plus the live Zod schema
 * that validates node `data`. Built-in types carry their original Zod object
 * schema; custom types carry one reconstructed from `jsonSchema`. This is a
 * TypeScript interface, not a Zod schema, because it bundles a Zod schema
 * object that is not itself serialisable data.
 */
export interface RuntimeNodeType extends NodeTypeDefinition {
  schema: z.ZodType;
}

/** Inputs to {@link defineBuiltInType}: metadata plus the live Zod data schema. */
export interface DefineBuiltInTypeConfig {
  name: string;
  label: string;
  color: string;
  icon: string;
  labelField: string;
  identityFields: string[];
  schema: z.ZodObject<z.ZodRawShape>;
}

/**
 * Register a built-in node type. Stores the Zod schema for runtime validation
 * and derives the serialisable `jsonSchema` via `z.toJSONSchema` so the type
 * can be persisted and reconstructed without the original Zod definition.
 */
export function defineBuiltInType(config: DefineBuiltInTypeConfig): RuntimeNodeType {
  return {
    name: config.name,
    label: config.label,
    color: config.color,
    icon: config.icon,
    labelField: config.labelField,
    identityFields: config.identityFields,
    jsonSchema: z.toJSONSchema(config.schema),
    schema: config.schema,
  };
}

/**
 * Project a runtime node type to its serialisable form by dropping the live
 * Zod `schema`. The remaining fields (including `jsonSchema`) are exactly what a
 * document persists; the projection is reversed on load via
 * {@link zodSchemaForType}, which recovers a Zod schema from `jsonSchema`.
 */
export function toPortableTypeDefinition(type: RuntimeNodeType): NodeTypeDefinition {
  return {
    name: type.name,
    label: type.label,
    color: type.color,
    icon: type.icon,
    labelField: type.labelField,
    identityFields: type.identityFields,
    jsonSchema: type.jsonSchema,
  };
}
