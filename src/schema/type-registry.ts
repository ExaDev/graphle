import { z } from "zod";

import { BUILT_IN_EDGE_TYPES_BY_NAME } from "./built-in-edge-types";
import { BUILT_IN_TYPES_BY_NAME } from "./built-in-types";
import type { EdgeTypeDefinition } from "./edge-type";
import type { NodeTypeDefinition } from "./node-type";

/**
 * Look up a node-type definition by name, preferring a definition carried in
 * the document and falling back to the built-in registry. Returns `undefined`
 * when no matching type exists.
 */
export function resolveType(
  types: NodeTypeDefinition[],
  name: string,
): NodeTypeDefinition | undefined {
  return types.find((type) => type.name === name) ?? BUILT_IN_TYPES_BY_NAME.get(name);
}

/** Cache of Zod schemas reconstructed from custom types' `jsonSchema`. Keyed
 *  by name + schema content so redefining a type (remove then re-add with the
 *  same name but different fields) gets a fresh schema, not a stale one. */
const customSchemas = new Map<string, z.ZodType>();

/** Composite cache key: type name + its jsonSchema serialised. */
function cacheKey(type: NodeTypeDefinition): string {
  return `${type.name}:${JSON.stringify(type.jsonSchema)}`;
}

/**
 * Resolve the live Zod schema that validates a node type's `data`. Built-in
 * types return their original Zod object schema (richer validation, e.g.
 * `min(1)` constraints); custom types reconstruct one from the definition's
 * `jsonSchema` via `z.fromJSONSchema`, cached by name + schema content.
 */
export function zodSchemaForType(type: NodeTypeDefinition): z.ZodType {
  const builtIn = BUILT_IN_TYPES_BY_NAME.get(type.name);
  if (builtIn !== undefined) {
    return builtIn.schema;
  }
  const key = cacheKey(type);
  const cached = customSchemas.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const reconstructed = z.fromJSONSchema(type.jsonSchema);
  customSchemas.set(key, reconstructed);
  return reconstructed;
}

/**
 * Look up an edge-type definition by name, preferring a definition carried in
 * the document and falling back to the built-in registry. Returns `undefined`
 * when no matching type exists.
 */
export function resolveEdgeType(
  edgeTypes: EdgeTypeDefinition[],
  name: string,
): EdgeTypeDefinition | undefined {
  return (
    edgeTypes.find((type) => type.name === name) ?? BUILT_IN_EDGE_TYPES_BY_NAME.get(name)
  );
}

/** Cache of Zod schemas reconstructed from custom edge types' `jsonSchema`,
 *  keyed the same way as {@link customSchemas}. */
const customEdgeSchemas = new Map<string, z.ZodType>();

/** Composite cache key: edge type name + its jsonSchema serialised. */
function edgeCacheKey(type: EdgeTypeDefinition): string {
  return `${type.name}:${JSON.stringify(type.jsonSchema)}`;
}

/**
 * Resolve the live Zod schema that validates an edge type's `data`. Built-in
 * types return their original Zod object schema; custom types reconstruct one
 * from the definition's `jsonSchema` via `z.fromJSONSchema`, cached by name +
 * schema content.
 */
export function zodSchemaForEdgeType(type: EdgeTypeDefinition): z.ZodType {
  const builtIn = BUILT_IN_EDGE_TYPES_BY_NAME.get(type.name);
  if (builtIn !== undefined) {
    return builtIn.schema;
  }
  const key = edgeCacheKey(type);
  const cached = customEdgeSchemas.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const reconstructed = z.fromJSONSchema(type.jsonSchema);
  customEdgeSchemas.set(key, reconstructed);
  return reconstructed;
}
