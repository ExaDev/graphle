/**
 * Graphviz DOT export. Produces `digraph G` syntax: one quoted, labelled
 * node statement per graph node, then one quoted arrow statement per edge
 * (optionally carrying a bracketed `label` attribute). Node ids are reused
 * directly as DOT node identifiers, quoted so that graphle-internal ids
 * (UUIDs) never collide with DOT's identifier syntax. Export is one-way —
 * there is no DOT-to-graphle import, since DOT carries no schema for
 * node/edge types or positions.
 */
import { resolveEdgeType, resolveType } from "../schema";
import type { GraphDocument, GraphEdge, GraphNode } from "../schema";

import { triggerDownload } from "./download";

// --- Helpers ----------------------------------------------------------------

/**
 * The primary display label for a graphle node. Resolves the node's type
 * (from the document's `types`, falling back to the built-in registry) and
 * reads the field named by its `labelField`, matching the label-resolution
 * pattern used by JSON Canvas and Mermaid export. Falls back to the node's
 * id when no label field value is found.
 */
function nodeLabelText(node: GraphNode, doc: GraphDocument): string {
  const type = resolveType(doc.types, node.type);
  const labelField = type?.labelField;
  if (labelField !== undefined) {
    const value = node.data[labelField];
    if (typeof value === "string") return value;
    if (value !== undefined) return JSON.stringify(value);
  }
  return node.id;
}

/**
 * The display label for a graphle edge, or `undefined` when there is no
 * string value to show — an unlabelled edge is rendered as a bare arrow
 * rather than carrying its type name as a label on every export.
 */
function edgeLabelText(edge: GraphEdge, doc: GraphDocument): string | undefined {
  const type = resolveEdgeType(doc.edgeTypes, edge.type);
  const labelField = type?.labelField;
  if (labelField === undefined) return undefined;
  const value = edge.data[labelField];
  return typeof value === "string" ? value : undefined;
}

/** Escape a literal double-quote inside a DOT quoted-string. */
function escapeDotLabel(label: string): string {
  return label.replaceAll('"', '\\"');
}

// --- Transforms (pure) -------------------------------------------------------

/**
 * Transform a graphle document into Graphviz DOT syntax (`digraph G`). Every
 * node becomes a quoted, labelled node statement; every edge becomes a
 * quoted arrow statement, carrying a bracketed `label` attribute when one
 * resolves.
 */
export function documentToDot(doc: GraphDocument): string {
  const lines = ["digraph G {"];
  for (const node of doc.nodes) {
    const label = escapeDotLabel(nodeLabelText(node, doc));
    lines.push(`    "${node.id}" [label="${label}"];`);
  }
  for (const edge of doc.edges) {
    const label = edgeLabelText(edge, doc);
    if (label === undefined) {
      lines.push(`    "${edge.source}" -> "${edge.target}";`);
    } else {
      lines.push(`    "${edge.source}" -> "${edge.target}" [label="${escapeDotLabel(label)}"];`);
    }
  }
  lines.push("}");
  return lines.join("\n");
}

/**
 * Trigger a browser download of the document as `graphle-export.dot`. See
 * {@link triggerDownload} for the underlying browser-only side effect.
 */
export function triggerDotDownload(doc: GraphDocument): void {
  triggerDownload(documentToDot(doc), "graphle-export.dot", "text/vnd.graphviz");
}
