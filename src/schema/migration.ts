import { z } from "zod";

import { BUILT_IN_EDGE_TYPES } from "./built-in-edge-types";
import { BUILT_IN_TYPES } from "./built-in-types";
import { toPortableEdgeTypeDefinition } from "./edge-type";
import { GraphNodeSchema } from "./node";
import { NodeTypeDefinitionSchema, toPortableTypeDefinition } from "./node-type";
import { NodeId, Position } from "./primitives";

/**
 * The node-type names a v1 document could carry. v1 stored only the `kind`
 * discriminator on each node and no type definitions; on migration these five
 * built-in definitions are injected so the resulting document is
 * self-describing.
 */
const V1_TYPE_NAMES = new Set(["freeform", "org", "repo", "issue", "project"]);

/**
 * Serialisable type definitions for the five node types a v1 document used,
 * projected from the built-in registry (the live Zod `schema` is stripped — a
 * migrated document persists only the `jsonSchema` projection).
 */
const V1_TYPE_DEFINITIONS = BUILT_IN_TYPES.filter((type) =>
  V1_TYPE_NAMES.has(type.name),
).map(toPortableTypeDefinition);

/** Every built-in edge type, projected to its portable form, injected by v2 -> v3. */
const V2_EDGE_TYPE_DEFINITIONS = BUILT_IN_EDGE_TYPES.map(toPortableEdgeTypeDefinition);

/** A v1 node: discriminated by `kind`, with opaque `data`. */
const V1Node = z.object({
  id: NodeId,
  kind: z.string(),
  position: Position,
  data: z.record(z.string(), z.unknown()),
});

/**
 * The fixed five-value relation enum every v1/v2 edge carried, before edges
 * gained dynamic types. Kept local to migration — the current schema layer no
 * longer defines this type at all.
 */
const LegacyEdgeRelation = z.enum(["owns", "contains", "tracks", "references", "custom"]);

/** A v1/v2 edge: a fixed relation plus an optional free-text label. */
const LegacyEdge = z.object({
  id: NodeId,
  source: NodeId,
  target: NodeId,
  relation: LegacyEdgeRelation,
  label: z.string().optional(),
});

/** The v1 document shape, used only to validate input before transformation. */
const V1Document = z.object({
  version: z.literal(1),
  name: z.string(),
  nodes: z.array(V1Node),
  edges: z.array(LegacyEdge),
});

/** The v2 document shape, used only to validate input before transformation. */
const V2Document = z.object({
  version: z.literal(2),
  name: z.string(),
  types: z.array(NodeTypeDefinitionSchema),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(LegacyEdge),
});

/**
 * Migrate a v2 graph document to the v3 shape. Each edge's `relation` becomes
 * its `type`, its optional `label` moves into `data.label` (an edge with no
 * label gets an empty `data`), the five built-in edge type definitions are
 * injected into a new `edgeTypes` array, and the version is bumped to 3. Node
 * types/nodes carry through unchanged. The returned object is shaped for
 * {@link GraphDocumentSchema}.parse; invalid v2 input throws (loud failure)
 * rather than producing a half-migrated document.
 */
export function migrateV2Document(raw: unknown): unknown {
  const v2 = V2Document.parse(raw);
  return {
    version: 3,
    name: v2.name,
    types: v2.types,
    edgeTypes: V2_EDGE_TYPE_DEFINITIONS,
    nodes: v2.nodes,
    edges: v2.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: edge.relation,
      data: edge.label !== undefined ? { label: edge.label } : {},
    })),
  };
}

/**
 * Migrate a v1 graph document to the v3 shape. Each node's `kind` becomes its
 * `type` and the five original built-in node-type definitions are injected
 * (the v1 -> v2 step), then the result is fed through {@link migrateV2Document}
 * (the v2 -> v3 step) so a v1 document reaches the current shape in one call.
 * Invalid v1 input throws (loud failure) rather than producing a
 * half-migrated document.
 */
export function migrateV1Document(raw: unknown): unknown {
  const v1 = V1Document.parse(raw);
  return migrateV2Document({
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
  });
}
