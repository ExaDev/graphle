/**
 * URL codec for sharing a graph as a self-contained, compressed fragment.
 *
 * The v3 wire format is a compact JSON envelope:
 *
 *   { v: 3, n, t: [<compactTypeDef>...], et: [<compactEdgeTypeDef>...],
 *     d: [<compactNode>...], e: [<compactEdge>...] }
 *
 * A compact type def is `{ n, l, c, i, lf, id, s }` — the seven fields of a
 * NodeTypeDefinition (name, label, colour, icon, labelField, identityFields,
 * jsonSchema) inlined with short keys. A compact edge type def is
 * `{ n, l, c, ss, lf, s }` — the six fields of an EdgeTypeDefinition (name,
 * label, colour, strokeStyle, labelField, jsonSchema). Together they let a
 * recipient reconstruct every node and edge type the document uses without an
 * external registry. A compact node is `{ t, x, y, ...data }` — the type name
 * plus the node's data fields inlined generically (no per-kind mapping); the
 * node id is not carried, it is remapped to the node's index in `d`. A compact
 * edge is `{ s, t, et, ...data }` — `s`/`t` are indices into `d`, `et` is the
 * edge's type name, and the rest are the edge's data fields inlined
 * generically; the edge id is omitted.
 *
 * Encoding builds these arrays in a fixed field order so `JSON.stringify` is
 * deterministic for identical input, then compresses with lz-string. Decoding
 * decompresses, then dispatches on shape: a JSON Canvas document, a full graphle
 * document (v1/v2 migrated, v3 parsed directly), or the v3 compact envelope —
 * which is validated with Zod and rebuilt, assigning fresh node ids and
 * remapping edges via an index->id map so a shared graph never collides with
 * locally stored ids.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";

import {
  GraphDocumentSchema,
  GRAPH_DOCUMENT_VERSION,
  migrateV1Document,
  migrateV2Document,
} from "../schema";
import type { EdgeTypeDefinition, GraphDocument, NodeTypeDefinition } from "../schema";

import { parseCanvasFromUnknown } from "./jsoncanvas";

/** Thrown by {@link decodeDocument} for any malformed or unsupported payload. */
export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

// --- Compact wire schemas (decode side) -------------------------------------

/** Compact type def: short-key projection of a NodeTypeDefinition. */
const CompactTypeDefSchema = z.object({
  n: z.string(),
  l: z.string(),
  c: z.string(),
  i: z.string(),
  lf: z.string(),
  id: z.array(z.string()),
  s: z.record(z.string(), z.unknown()),
});
type CompactTypeDef = z.infer<typeof CompactTypeDefSchema>;

/** Compact edge type def: short-key projection of an EdgeTypeDefinition. */
const CompactEdgeTypeDefSchema = z.object({
  n: z.string(),
  l: z.string(),
  c: z.string(),
  ss: z.enum(["solid", "dashed", "dotted"]),
  lf: z.string(),
  s: z.record(z.string(), z.unknown()),
});
type CompactEdgeTypeDef = z.infer<typeof CompactEdgeTypeDefSchema>;

/**
 * Compact node: type name + position, with the node's data fields inlined as
 * extra keys. `z.looseObject` preserves those extra keys through `.parse` so the
 * generic data bag round-trips without a per-type mapping.
 */
const CompactNodeSchema = z.looseObject({
  t: z.string(),
  x: z.number(),
  y: z.number(),
});

/**
 * Compact edge: source/target node indices + edge type name, with the edge's
 * data fields inlined as extra keys (same generic-inlining pattern as
 * {@link CompactNodeSchema}).
 */
const CompactEdgeSchema = z.looseObject({
  s: z.number().int(),
  t: z.number().int(),
  et: z.string(),
});
type CompactEdge = z.infer<typeof CompactEdgeSchema>;

const CompactEnvelopeSchema = z.object({
  v: z.literal(GRAPH_DOCUMENT_VERSION),
  n: z.string(),
  t: z.array(CompactTypeDefSchema),
  et: z.array(CompactEdgeTypeDefSchema),
  d: z.array(CompactNodeSchema),
  e: z.array(CompactEdgeSchema),
});
type CompactEnvelope = z.infer<typeof CompactEnvelopeSchema>;

// --- Helpers ----------------------------------------------------------------

/** Narrows `unknown` to a record without any cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The compact edge's inlined data fields — every key except `s`/`t`/`et`. */
const COMPACT_EDGE_ENVELOPE_KEYS = new Set(["s", "t", "et"]);

/**
 * Peel a compact edge's inlined data fields out, leaving the envelope keys
 * (`s`, `t`, `et`) behind. Filters `Object.entries` rather than destructuring
 * `s`/`t` into unused local bindings — both are read from `edge` directly by
 * the caller before this runs.
 */
function edgeDataFields(edge: CompactEdge): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edge)) {
    if (COMPACT_EDGE_ENVELOPE_KEYS.has(key)) continue;
    data[key] = value;
  }
  return data;
}

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Encode a node type definition into the compact short-key form. */
function toCompactTypeDef(type: NodeTypeDefinition): Record<string, unknown> {
  return {
    n: type.name,
    l: type.label,
    c: type.color,
    i: type.icon,
    lf: type.labelField,
    id: type.identityFields,
    s: type.jsonSchema,
  };
}

/** Decode a compact short-key type def back into a NodeTypeDefinition. */
function fromCompactTypeDef(td: CompactTypeDef): NodeTypeDefinition {
  return {
    name: td.n,
    label: td.l,
    color: td.c,
    icon: td.i,
    labelField: td.lf,
    identityFields: td.id,
    jsonSchema: td.s,
  };
}

/** Encode an edge type definition into the compact short-key form. */
function toCompactEdgeTypeDef(type: EdgeTypeDefinition): Record<string, unknown> {
  return {
    n: type.name,
    l: type.label,
    c: type.color,
    ss: type.strokeStyle,
    lf: type.labelField,
    s: type.jsonSchema,
  };
}

/** Decode a compact short-key edge type def back into an EdgeTypeDefinition. */
function fromCompactEdgeTypeDef(td: CompactEdgeTypeDef): EdgeTypeDefinition {
  return {
    name: td.n,
    label: td.l,
    color: td.c,
    strokeStyle: td.ss,
    labelField: td.lf,
    jsonSchema: td.s,
  };
}

/**
 * Rebuild a full document from the validated compact envelope. Type defs are
 * re-expanded; nodes get fresh ids and their inlined data peeled out of the
 * compact record; an index->id map is built so each edge's `s`/`t` can be
 * repointed and its inlined data peeled out the same way as a node's. Returns
 * `unknown` so the final {@link GraphDocumentSchema}.parse is the single type
 * authority for the rebuilt shape.
 */
function rebuildDocument(envelope: CompactEnvelope): unknown {
  const types = envelope.t.map(fromCompactTypeDef);
  const edgeTypes = envelope.et.map(fromCompactEdgeTypeDef);

  const indexToId = new Map<number, string>();
  const nodes = envelope.d.map((node, index) => {
    const id = crypto.randomUUID();
    indexToId.set(index, id);
    const { t, x, y, ...data } = node;
    return {
      id,
      type: t,
      position: { x, y },
      data,
    };
  });

  const edges = envelope.e.map((edge) => {
    const source = indexToId.get(edge.s);
    const target = indexToId.get(edge.t);
    if (source === undefined) {
      throw new ShareDecodeError(
        `Share payload edge references out-of-range source index ${edge.s}`,
      );
    }
    if (target === undefined) {
      throw new ShareDecodeError(
        `Share payload edge references out-of-range target index ${edge.t}`,
      );
    }
    return {
      id: crypto.randomUUID(),
      source,
      target,
      type: edge.et,
      data: edgeDataFields(edge),
    };
  });

  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: envelope.n,
    types,
    edgeTypes,
    nodes,
    edges,
  };
}

/**
 * Decode a full graphle document carried in the payload (rather than the compact
 * envelope). A v1 document is migrated straight to v3 (the v1 -> v2 -> v3 chain
 * lives in {@link migrateV1Document}); a v2 document is migrated to v3 via
 * {@link migrateV2Document}; a v3 document is parsed directly. Returns the
 * validated document or throws {@link ShareDecodeError}.
 */
function decodeFullDocument(json: Record<string, unknown>): GraphDocument {
  const version = json.version;
  try {
    if (version === 1) {
      return GraphDocumentSchema.parse(migrateV1Document(json));
    }
    if (version === 2) {
      return GraphDocumentSchema.parse(migrateV2Document(json));
    }
    return GraphDocumentSchema.parse(json);
  } catch (error) {
    if (error instanceof ShareDecodeError) throw error;
    throw new ShareDecodeError(`Share payload is malformed: ${describe(error)}`);
  }
}

/**
 * Validate and rebuild a v3 compact share envelope. Any version other than 3 is
 * unsupported (older compact wire formats carried a different edge shape that
 * this codec no longer produces); v1/v2 documents arrive via
 * {@link decodeFullDocument}.
 */
function decodeCompactEnvelope(json: Record<string, unknown>): GraphDocument {
  const version = json.v;
  if (version === undefined) {
    throw new ShareDecodeError("Share payload is missing the version field");
  }
  if (version !== GRAPH_DOCUMENT_VERSION) {
    throw new ShareDecodeError(
      `Share payload uses unsupported version ${JSON.stringify(version)}`,
    );
  }

  try {
    const envelope = CompactEnvelopeSchema.parse(json);
    return GraphDocumentSchema.parse(rebuildDocument(envelope));
  } catch (error) {
    if (error instanceof ShareDecodeError) throw error;
    throw new ShareDecodeError(`Share payload is malformed: ${describe(error)}`);
  }
}

// --- Public API -------------------------------------------------------------

/** Compress a graph document into a URL-safe share string. */
export function encodeDocument(doc: GraphDocument): string {
  const idToIndex = new Map<string, number>();
  doc.nodes.forEach((node, index) => {
    idToIndex.set(node.id, index);
  });

  const compactTypes = doc.types.map(toCompactTypeDef);
  const compactEdgeTypes = doc.edgeTypes.map(toCompactEdgeTypeDef);

  const compactNodes = doc.nodes.map((node) => ({
    t: node.type,
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    ...node.data,
  }));

  const compactEdges = doc.edges.map((edge) => {
    const sourceIndex = idToIndex.get(edge.source);
    const targetIndex = idToIndex.get(edge.target);
    if (sourceIndex === undefined) {
      throw new Error(
        `encodeDocument: edge ${edge.id} references unknown source node ${edge.source}`,
      );
    }
    if (targetIndex === undefined) {
      throw new Error(
        `encodeDocument: edge ${edge.id} references unknown target node ${edge.target}`,
      );
    }
    return {
      s: sourceIndex,
      t: targetIndex,
      et: edge.type,
      ...edge.data,
    };
  });

  const envelope = {
    v: GRAPH_DOCUMENT_VERSION,
    n: doc.name,
    t: compactTypes,
    et: compactEdgeTypes,
    d: compactNodes,
    e: compactEdges,
  };
  return compressToEncodedURIComponent(JSON.stringify(envelope));
}

/** Decompress a share string back into a validated graph document. */
export function decodeDocument(payload: string): GraphDocument {
  const decompressed = decompressFromEncodedURIComponent(payload);
  if (!decompressed) {
    throw new ShareDecodeError("Share payload could not be decompressed");
  }

  let json: unknown;
  try {
    json = JSON.parse(decompressed);
  } catch (error) {
    throw new ShareDecodeError(`Share payload is not valid JSON: ${describe(error)}`);
  }

  if (!isRecord(json)) {
    throw new ShareDecodeError("Share payload is not a JSON object");
  }

  // JSON Canvas: carries `nodes`/`edges` but neither the compact `v` key nor a
  // full-document `version`.
  if (!("v" in json) && !("version" in json) && ("nodes" in json || "edges" in json)) {
    try {
      return parseCanvasFromUnknown(json);
    } catch (error) {
      if (error instanceof ShareDecodeError) throw error;
      throw new ShareDecodeError(
        `Share payload is malformed JSON Canvas: ${describe(error)}`,
      );
    }
  }

  // Full graphle document (carries `version`): migrate v1/v2, parse v3.
  if ("version" in json) {
    return decodeFullDocument(json);
  }

  // Compact share envelope (carries `v`).
  return decodeCompactEnvelope(json);
}
