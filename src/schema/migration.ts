import { z } from "zod";

import { BUILT_IN_TYPES } from "./built-in-types";
import { GraphEdge } from "./edge";
import { toPortableTypeDefinition } from "./node-type";
import { NodeId, Position } from "./primitives";

/**
 * The node-type names a v1 document could carry. v1 stored only the `kind`
 * discriminator on each node and no type definitions; on migration these five
 * built-in definitions are injected so the resulting v2 document is
 * self-describing.
 */
const V1_TYPE_NAMES = new Set(["freeform", "org", "repo", "issue", "project"]);

/**
 * Serialisable type definitions for the five node types a v1 document used,
 * projected from the built-in registry (the live Zod `schema` is stripped — a
 * v2 document persists only the `jsonSchema` projection).
 */
const V1_TYPE_DEFINITIONS = BUILT_IN_TYPES.filter((type) =>
  V1_TYPE_NAMES.has(type.name),
).map(toPortableTypeDefinition);

/** A v1 node: discriminated by `kind`, with opaque `data`. */
const V1Node = z.object({
  id: NodeId,
  kind: z.string(),
  position: Position,
  data: z.record(z.string(), z.unknown()),
});

/** The v1 document shape, used only to validate input before transformation. */
const V1Document = z.object({
  version: z.literal(1),
  name: z.string(),
  nodes: z.array(V1Node),
  edges: z.array(GraphEdge),
});

/**
 * Migrate a v1 graph document to the v2 shape. Each node's `kind` becomes its
 * `type`, the five original built-in type definitions are injected into a new
 * `types` array, and the version is bumped to 2. The returned object is shaped
 * for {@link GraphDocumentSchema}.parse; invalid v1 input throws (loud failure)
 * rather than producing a half-migrated document.
 */
export function migrateV1Document(raw: unknown): unknown {
  const v1 = V1Document.parse(raw);
  return {
    version: 2,
    name: v1.name,
    types: V1_TYPE_DEFINITIONS,
    nodes: v1.nodes.map((node) => ({
      id: node.id,
      type: node.kind,
      position: node.position,
      data: node.data,
    })),
    edges: v1.edges,
  };
}
