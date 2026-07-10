/**
 * URL codec for sharing a graph as a self-contained, compressed fragment.
 *
 * The wire format is a compact JSON envelope:
 *
 *   { v: 1, n: <name>, d: [<compactNode>...], e: [<compactEdge>...] }
 *
 * A compact node is a fixed-field object: a single-letter kind code
 * (`f`/`o`/`r`/`i`/`p`), `x`/`y` rounded with `Math.round`, and only the data
 * fields that are actually present (absent optionals omitted). The node id is
 * not carried — it is remapped to the node's index in `d`. A compact edge is
 * `{ s, t, r, l? }` where `s`/`t` are indices into `d` and the edge id is
 * omitted. Encoding builds these arrays in a fixed field order so
 * `JSON.stringify` is deterministic for identical input, then compresses with
 * lz-string. Decoding reverses the transform, assigning fresh ids on the way
 * back so a shared graph never collides with locally stored ids.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { z } from "zod";

import { EdgeRelation, GraphDocument, GRAPH_DOCUMENT_VERSION } from "../schema";
import type { GraphNode, NodeKind } from "../schema";

import { parseCanvasFromUnknown } from "./jsoncanvas";

/** Single-letter kind codes used in the compact wire format. */
type NodeKindCode = "f" | "o" | "r" | "i" | "p";

/** Thrown by {@link decodeDocument} for any malformed or unsupported payload. */
export class ShareDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShareDecodeError";
  }
}

// --- Compact wire schemas (decode side) -------------------------------------

const CompactFreeformNode = z.object({
  k: z.literal("f"),
  x: z.number(),
  y: z.number(),
  label: z.string(),
  note: z.string().optional(),
});

const CompactOrgNode = z.object({
  k: z.literal("o"),
  x: z.number(),
  y: z.number(),
  login: z.string(),
  name: z.string().optional(),
  url: z.string().optional(),
  avatarUrl: z.string().optional(),
});

const CompactRepoNode = z.object({
  k: z.literal("r"),
  x: z.number(),
  y: z.number(),
  owner: z.string(),
  name: z.string(),
  url: z.string().optional(),
  description: z.string().optional(),
  archived: z.boolean().optional(),
});

const CompactIssueNode = z.object({
  k: z.literal("i"),
  x: z.number(),
  y: z.number(),
  owner: z.string(),
  repo: z.string(),
  number: z.number().int(),
  title: z.string(),
  state: z.enum(["open", "closed"]).optional(),
  url: z.string().optional(),
});

const CompactProjectNode = z.object({
  k: z.literal("p"),
  x: z.number(),
  y: z.number(),
  owner: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.string().optional(),
  projectNodeId: z.string().optional(),
});

const CompactNodeSchema = z.discriminatedUnion("k", [
  CompactFreeformNode,
  CompactOrgNode,
  CompactRepoNode,
  CompactIssueNode,
  CompactProjectNode,
]);
type CompactNode = z.infer<typeof CompactNodeSchema>;

const CompactEdgeSchema = z.object({
  s: z.number().int(),
  t: z.number().int(),
  r: EdgeRelation,
  l: z.string().optional(),
});

const CompactEnvelopeSchema = z.object({
  v: z.literal(GRAPH_DOCUMENT_VERSION),
  n: z.string(),
  d: z.array(CompactNodeSchema),
  e: z.array(CompactEdgeSchema),
});
type CompactEnvelope = z.infer<typeof CompactEnvelopeSchema>;

// --- Helpers ----------------------------------------------------------------

/** Narrows `unknown` to a record without any cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read `v` from the parsed payload, or `undefined` if it is absent. */
function readVersion(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  return value.v;
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

function kindToCode(kind: NodeKind): NodeKindCode {
  switch (kind) {
    case "freeform":
      return "f";
    case "org":
      return "o";
    case "repo":
      return "r";
    case "issue":
      return "i";
    case "project":
      return "p";
  }
}

function codeToKind(code: NodeKindCode): NodeKind {
  switch (code) {
    case "f":
      return "freeform";
    case "o":
      return "org";
    case "r":
      return "repo";
    case "i":
      return "issue";
    case "p":
      return "project";
  }
}

/** Build compact data fields (present values only) for a node, in fixed order. */
function compactNodeData(node: GraphNode): Record<string, unknown> {
  switch (node.kind) {
    case "freeform":
      return pickDefined({ label: node.data.label, note: node.data.note });
    case "org":
      return pickDefined({
        login: node.data.login,
        name: node.data.name,
        url: node.data.url,
        avatarUrl: node.data.avatarUrl,
      });
    case "repo":
      return pickDefined({
        owner: node.data.owner,
        name: node.data.name,
        url: node.data.url,
        description: node.data.description,
        archived: node.data.archived,
      });
    case "issue":
      return pickDefined({
        owner: node.data.owner,
        repo: node.data.repo,
        number: node.data.number,
        title: node.data.title,
        state: node.data.state,
        url: node.data.url,
      });
    case "project":
      return pickDefined({
        owner: node.data.owner,
        number: node.data.number,
        title: node.data.title,
        url: node.data.url,
        projectNodeId: node.data.projectNodeId,
      });
  }
}

/** Rebuild data fields (present values only) from a compact node. */
function decodeNodeData(compact: CompactNode): Record<string, unknown> {
  switch (compact.k) {
    case "f":
      return pickDefined({ label: compact.label, note: compact.note });
    case "o":
      return pickDefined({
        login: compact.login,
        name: compact.name,
        url: compact.url,
        avatarUrl: compact.avatarUrl,
      });
    case "r":
      return pickDefined({
        owner: compact.owner,
        name: compact.name,
        url: compact.url,
        description: compact.description,
        archived: compact.archived,
      });
    case "i":
      return pickDefined({
        owner: compact.owner,
        repo: compact.repo,
        number: compact.number,
        title: compact.title,
        state: compact.state,
        url: compact.url,
      });
    case "p":
      return pickDefined({
        owner: compact.owner,
        number: compact.number,
        title: compact.title,
        url: compact.url,
        projectNodeId: compact.projectNodeId,
      });
  }
}

/**
 * Rebuild a full document from the validated compact envelope. Nodes get fresh
 * ids and an index->id map is built so each edge's `s`/`t` can be repointed.
 * Returns `unknown` so the final {@link GraphDocument.parse} is the single
 * type authority for the rebuilt shape.
 */
function rebuildDocument(envelope: CompactEnvelope): unknown {
  const indexToId = new Map<number, string>();
  const nodes = envelope.d.map((node, index) => {
    const id = crypto.randomUUID();
    indexToId.set(index, id);
    return {
      id,
      kind: codeToKind(node.k),
      position: { x: node.x, y: node.y },
      data: decodeNodeData(node),
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
    nodes,
    edges,
  };
}

// --- Public API -------------------------------------------------------------

/** Compress a graph document into a URL-safe share string. */
export function encodeDocument(doc: GraphDocument): string {
  const idToIndex = new Map<string, number>();
  doc.nodes.forEach((node, index) => {
    idToIndex.set(node.id, index);
  });

  const compactNodes = doc.nodes.map((node) => ({
    k: kindToCode(node.kind),
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    ...compactNodeData(node),
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

  // JSON Canvas: has `nodes` or `edges` but not the compact `v` key.
  if (!("v" in json) && ("nodes" in json || "edges" in json)) {
    try {
      return parseCanvasFromUnknown(json);
    } catch (error) {
      if (error instanceof ShareDecodeError) throw error;
      throw new ShareDecodeError(
        `Share payload is malformed JSON Canvas: ${describe(error)}`,
      );
    }
  }

  const version = readVersion(json);
  if (version !== GRAPH_DOCUMENT_VERSION) {
    throw new ShareDecodeError(
      version === undefined
        ? "Share payload is missing the version field"
        : `Share payload uses unsupported version ${JSON.stringify(version)}`,
    );
  }

  try {
    const envelope = CompactEnvelopeSchema.parse(json);
    return GraphDocument.parse(rebuildDocument(envelope));
  } catch (error) {
    if (error instanceof ShareDecodeError) throw error;
    throw new ShareDecodeError(`Share payload is malformed: ${describe(error)}`);
  }
}
