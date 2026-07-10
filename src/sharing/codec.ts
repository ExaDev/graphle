/**
 * URL codec for sharing a graph as a self-contained, compressed fragment.
 *
 * The v2 wire format is a compact JSON envelope:
 *
 *   { v: 2, n, t: [<compactTypeDef>...], d: [<compactNode>...], e: [<compactEdge>...] }
 *
 * A compact type def is `{ n, l, c, i, lf, id, s }` — the seven fields of a
 * NodeTypeDefinition (name, label, colour, icon, labelField, identityFields,
 * jsonSchema) inlined with short keys, so a recipient can reconstruct every type
 * the document uses without an external registry. A compact node is
 * `{ t, x, y, ...data }` — the type name plus the node's data fields inlined
 * generically (no per-kind mapping); the node id is not carried, it is remapped
 * to the node's index in `d`. A compact edge is `{ s, t, r, l? }` where `s`/`t`
 * are indices into `d` and the edge id is omitted.
 *
 * Encoding builds these arrays in a fixed field order so `JSON.stringify` is
 * deterministic for identical input, then compresses with lz-string. Decoding
 * decompresses, then dispatches on shape: a JSON Canvas document, a full graphle
 * document (v1 migrated, v2 parsed directly), or the v2 compact envelope — which
 * is validated with Zod and rebuilt, assigning fresh node ids and remapping
 * edges via an index->id map so a shared graph never collides with locally
 * stored ids.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";

import {
  EdgeRelation,
  GraphDocumentSchema,
  GRAPH_DOCUMENT_VERSION,
  migrateV1Document,
} from "../schema";
import type { GraphDocument, NodeTypeDefinition } from "../schema";

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

const CompactEdgeSchema = z.object({
  s: z.number().int(),
  t: z.number().int(),
  r: EdgeRelation,
  l: z.string().optional(),
});

const CompactEnvelopeSchema = z.object({
  v: z.literal(GRAPH_DOCUMENT_VERSION),
  n: z.string(),
  t: z.array(CompactTypeDefSchema),
  d: z.array(CompactNodeSchema),
  e: z.array(CompactEdgeSchema),
});
type CompactEnvelope = z.infer<typeof CompactEnvelopeSchema>;

// --- Helpers ----------------------------------------------------------------

/** Narrows `unknown` to a record without any cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Copy a field-ordered object, dropping keys whose value is `undefined`.
 * Iterating `Object.entries` preserves insertion order, so the fixed field
 * order of the input literal is carried into the serialised output and two
 * structurally equal documents encode byte-identically.
 */
function pickDefined(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Encode a type definition into the compact short-key form. */
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

/**
 * Rebuild a full document from the validated compact envelope. Type defs are
 * re-expanded; nodes get fresh ids and their inlined data peeled out of the
 * compact record; an index->id map is built so each edge's `s`/`t` can be
 * repointed. Returns `unknown` so the final {@link GraphDocumentSchema}.parse is
 * the single type authority for the rebuilt shape.
 */
function rebuildDocument(envelope: CompactEnvelope): unknown {
  const types = envelope.t.map(fromCompactTypeDef);

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
    return pickDefined({
      id: crypto.randomUUID(),
      source,
      target,
      relation: edge.r,
      label: edge.l,
    });
  });

  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: envelope.n,
    types,
    nodes,
    edges,
  };
}

/**
 * Decode a full graphle document carried in the payload (rather than the compact
 * envelope). A v1 document is migrated to v2 first; a v2 document is parsed
 * directly. Returns the validated document or throws {@link ShareDecodeError}.
 */
function decodeFullDocument(json: Record<string, unknown>): GraphDocument {
  const version = json.version;
  try {
    if (version === 1) {
      return GraphDocumentSchema.parse(migrateV1Document(json));
    }
    return GraphDocumentSchema.parse(json);
  } catch (error) {
    if (error instanceof ShareDecodeError) throw error;
    throw new ShareDecodeError(`Share payload is malformed: ${describe(error)}`);
  }
}

/**
 * Validate and rebuild a v2 compact share envelope. Any version other than 2 is
 * unsupported (the legacy v1 compact wire format used per-kind codes that this
 * codec no longer carries); v1 documents arrive via {@link decodeFullDocument}.
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
    return pickDefined({
      s: sourceIndex,
      t: targetIndex,
      r: edge.relation,
      l: edge.label,
    });
  });

  const envelope = {
    v: GRAPH_DOCUMENT_VERSION,
    n: doc.name,
    t: compactTypes,
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

  // Full graphle document (carries `version`): migrate v1, parse v2.
  if ("version" in json) {
    return decodeFullDocument(json);
  }

  // Compact share envelope (carries `v`).
  return decodeCompactEnvelope(json);
}
