/**
 * Obsidian JSON Canvas (v1.0) support: Zod codecs for the format and pure
 * transforms to/from graphle's {@link GraphDocument}.
 *
 * JSON Canvas is generic — nodes are `text`/`file`/`link`/`group`, edges have
 * `fromNode`/`toNode`/`label` — so the mapping is inherently lossy relative to
 * graphle's typed nodes. Export resolves each node's type definition to find its
 * `labelField` and renders that field as the canvas card text; import makes
 * every canvas node a graphle `freeform` node with the canvas content as the
 * label.
 *
 * Spec: <https://github.com/obsidianmd/jsoncanvas/blob/main/spec/1.0.md>
 */
import { z } from "zod";

import {
  BUILT_IN_EDGE_TYPES_BY_NAME,
  BUILT_IN_TYPES_BY_NAME,
  GRAPH_DOCUMENT_VERSION,
  GraphDocumentSchema,
  resolveEdgeType,
  resolveType,
  toPortableEdgeTypeDefinition,
  toPortableTypeDefinition,
} from "../schema";
import type {
  EdgeTypeDefinition,
  GraphDocument,
  GraphEdge,
  GraphNode,
  NodeTypeDefinition,
} from "../schema";

// --- Zod codecs for the JSON Canvas format ---------------------------------

/** Canvas colour: a hex string (e.g. `"#FF0000"`) or a preset `"1"`–`"6"`. */
const CanvasColorSchema = z.string();

/** Attributes common to every canvas node (per spec v1.0). */
const CanvasBaseNodeSchema = z.object({
  id: z.string(),
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  color: CanvasColorSchema.optional(),
});

const CanvasTextNodeSchema = CanvasBaseNodeSchema.extend({
  type: z.literal("text"),
  text: z.string(),
});
export type CanvasTextNode = z.infer<typeof CanvasTextNodeSchema>;

const CanvasFileNodeSchema = CanvasBaseNodeSchema.extend({
  type: z.literal("file"),
  file: z.string(),
  subpath: z.string().optional(),
});
export type CanvasFileNode = z.infer<typeof CanvasFileNodeSchema>;

const CanvasLinkNodeSchema = CanvasBaseNodeSchema.extend({
  type: z.literal("link"),
  url: z.string(),
});
export type CanvasLinkNode = z.infer<typeof CanvasLinkNodeSchema>;

const CanvasGroupNodeSchema = CanvasBaseNodeSchema.extend({
  type: z.literal("group"),
  label: z.string().optional(),
  background: z.string().optional(),
  backgroundStyle: z.enum(["cover", "ratio", "repeat"]).optional(),
});
export type CanvasGroupNode = z.infer<typeof CanvasGroupNodeSchema>;

export const CanvasNodeSchema = z.discriminatedUnion("type", [
  CanvasTextNodeSchema,
  CanvasFileNodeSchema,
  CanvasLinkNodeSchema,
  CanvasGroupNodeSchema,
]);
export type CanvasNode = z.infer<typeof CanvasNodeSchema>;

export const CanvasEdgeSchema = z.object({
  id: z.string(),
  fromNode: z.string(),
  fromSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  fromEnd: z.enum(["none", "arrow"]).optional(),
  toNode: z.string(),
  toSide: z.enum(["top", "right", "bottom", "left"]).optional(),
  toEnd: z.enum(["none", "arrow"]).optional(),
  color: CanvasColorSchema.optional(),
  label: z.string().optional(),
});
export type CanvasEdge = z.infer<typeof CanvasEdgeSchema>;

export const CanvasDocumentSchema = z.object({
  nodes: z.array(CanvasNodeSchema).optional(),
  edges: z.array(CanvasEdgeSchema).optional(),
});
export type CanvasDocument = z.infer<typeof CanvasDocumentSchema>;

// --- Constants --------------------------------------------------------------

/** Default dimensions for exported canvas nodes (graphle auto-sizes, canvas
 *  requires explicit width/height). */
const CANVAS_NODE_WIDTH = 250;
const CANVAS_NODE_HEIGHT = 120;

// --- Helpers ----------------------------------------------------------------

/**
 * The primary display label for a graphle node, used as the canvas card text.
 * Resolves the node's type (from the document's `types`, falling back to the
 * built-in registry) and reads the field named by its `labelField`. When the
 * value is missing or non-string the type's display label (or, last resort, the
 * raw type name) is used — canvas export is lossy by design, so a readable
 * placeholder beats an empty card.
 */
function nodeLabelText(node: GraphNode, types: NodeTypeDefinition[]): string {
  const type = resolveType(types, node.type);
  const labelField = type?.labelField;
  if (labelField !== undefined) {
    const value = node.data[labelField];
    if (typeof value === "string") return value;
    if (value !== undefined) return JSON.stringify(value);
  }
  return type?.label ?? node.type;
}

/**
 * The display label for a graphle edge, used as the canvas edge label.
 * Resolves the edge's type (from the document's `edgeTypes`, falling back to
 * the built-in registry) and reads the field named by its `labelField`.
 * Returns `undefined` when there is no string value to show (the canvas edge
 * label is optional, unlike a node's card text), rather than falling back to
 * the type's display label — an edge with no label reads better unlabelled
 * than carrying its type name as a label on every export.
 */
function edgeLabelText(edge: GraphEdge, edgeTypes: EdgeTypeDefinition[]): string | undefined {
  const type = resolveEdgeType(edgeTypes, edge.type);
  const labelField = type?.labelField;
  if (labelField === undefined) return undefined;
  const value = edge.data[labelField];
  return typeof value === "string" ? value : undefined;
}

/** The graphle label for a canvas node (its content rendered as a string). */
function canvasNodeLabel(node: CanvasNode): string {
  switch (node.type) {
    case "text":
      return node.text;
    case "file":
      return node.file;
    case "link":
      return node.url;
    case "group":
      return node.label ?? "Group";
  }
}

// --- Transforms (pure) ------------------------------------------------------

/**
 * Transform a graphle document into a JSON Canvas document. Every node becomes
 * a `text` card labelled via its type's `labelField`; every edge carries the
 * relation (or explicit label) as its canvas label. Node ids are reused so
 * edges map directly.
 */
export function toCanvasDocument(doc: GraphDocument): CanvasDocument {
  const nodes: CanvasTextNode[] = doc.nodes.map((node) => ({
    id: node.id,
    type: "text",
    x: Math.round(node.position.x),
    y: Math.round(node.position.y),
    width: CANVAS_NODE_WIDTH,
    height: CANVAS_NODE_HEIGHT,
    text: nodeLabelText(node, doc.types),
  }));

  const edges: CanvasEdge[] = doc.edges.map((edge) => {
    const label = edgeLabelText(edge, doc.edgeTypes);
    return {
      id: edge.id,
      fromNode: edge.source,
      toNode: edge.target,
      ...(label !== undefined ? { label } : {}),
    };
  });

  return { nodes, edges };
}

/**
 * Transform a validated JSON Canvas document into a graphle-compatible object.
 * Every canvas node becomes a `freeform` graphle node; every canvas edge
 * becomes a `references` graphle edge, its label (if any) carried in
 * `data.label`. Canvas ids are reused so edges map directly. The freeform and
 * references type definitions are injected so the result is self-describing.
 * Returns `unknown` so the final `GraphDocumentSchema`.parse is the single type
 * authority (same pattern as the compact codec).
 */
export function fromCanvasDocument(canvas: CanvasDocument): unknown {
  const freeformType = BUILT_IN_TYPES_BY_NAME.get("freeform");
  if (freeformType === undefined) {
    throw new Error("built-in freeform type must exist");
  }
  const referencesType = BUILT_IN_EDGE_TYPES_BY_NAME.get("references");
  if (referencesType === undefined) {
    throw new Error("built-in references edge type must exist");
  }

  const nodes = (canvas.nodes ?? []).map((node) => ({
    id: node.id,
    type: "freeform",
    position: { x: node.x, y: node.y },
    data: { label: canvasNodeLabel(node) },
  }));

  const edges = (canvas.edges ?? []).map((edge) => ({
    id: edge.id,
    source: edge.fromNode,
    target: edge.toNode,
    type: "references",
    data: edge.label !== undefined ? { label: edge.label } : {},
  }));

  return {
    version: GRAPH_DOCUMENT_VERSION,
    name: "Imported canvas",
    types: [toPortableTypeDefinition(freeformType)],
    edgeTypes: [toPortableEdgeTypeDefinition(referencesType)],
    nodes,
    edges,
  };
}

// --- Public API -------------------------------------------------------------

/** Validate an unknown value as a JSON Canvas document via the Zod codec. */
export function parseCanvasDocument(raw: unknown): CanvasDocument {
  return CanvasDocumentSchema.parse(raw);
}

/**
 * Full pipeline: validate as canvas -> transform -> validate as graphle. Used by
 * the URL codec and file import when the input is detected as JSON Canvas.
 */
export function parseCanvasFromUnknown(raw: unknown): GraphDocument {
  const canvas = parseCanvasDocument(raw);
  return GraphDocumentSchema.parse(fromCanvasDocument(canvas));
}

/** Serialise a graphle document as a pretty-printed JSON Canvas string. */
export function serialiseCanvasDocument(doc: GraphDocument): string {
  return JSON.stringify(toCanvasDocument(doc), null, 2);
}
