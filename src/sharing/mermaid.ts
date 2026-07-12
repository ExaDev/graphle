/**
 * Mermaid flowchart export. Produces `flowchart TD` syntax: one bracketed,
 * labelled node line per graph node, then one arrow line per edge (optionally
 * piped with a label). Node ids are reused directly as Mermaid node
 * identifiers since they are graphle-internal ids (UUIDs), already safe for
 * Mermaid's identifier syntax. Export is one-way — there is no
 * Mermaid-to-graphle import, since Mermaid carries no schema for node/edge
 * types or positions.
 */
import { resolveEdgeType, resolveType } from "../schema";
import type { GraphDocument, GraphEdge, GraphNode } from "../schema";

import { triggerDownload } from "./download";

// --- Helpers ----------------------------------------------------------------

/**
 * The primary display label for a graphle node. Resolves the node's type
 * (from the document's `types`, falling back to the built-in registry) and
 * reads the field named by its `labelField`, matching the label-resolution
 * pattern used by JSON Canvas export. Falls back to the node's id when no
 * label field value is found.
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

/** Escape a literal double-quote inside a Mermaid bracketed-label string. */
function escapeMermaidLabel(label: string): string {
  return label.replaceAll('"', "#quot;");
}

// --- Transforms (pure) -------------------------------------------------------

/**
 * Transform a graphle document into Mermaid flowchart syntax
 * (`flowchart TD`). Every node becomes a bracketed, labelled node line;
 * every edge becomes an arrow line, piped with its label when one resolves.
 */
export function documentToMermaid(doc: GraphDocument): string {
  const lines = ["flowchart TD"];
  for (const node of doc.nodes) {
    const label = escapeMermaidLabel(nodeLabelText(node, doc));
    lines.push(`    ${node.id}["${label}"]`);
  }
  for (const edge of doc.edges) {
    const label = edgeLabelText(edge, doc);
    if (label === undefined) {
      lines.push(`    ${edge.source} --> ${edge.target}`);
    } else {
      lines.push(`    ${edge.source} -->|${escapeMermaidLabel(label)}| ${edge.target}`);
    }
  }
  return lines.join("\n");
}

/**
 * Trigger a browser download of the document as `graphle-export.mmd`. See
 * {@link triggerDownload} for the underlying browser-only side effect.
 */
export function triggerMermaidDownload(doc: GraphDocument): void {
  triggerDownload(documentToMermaid(doc), "graphle-export.mmd", "text/plain");
}
