/**
 * JSON file import/export. Exported files are pretty-printed so they remain
 * diff- and review-friendly; imports round-trip through {@link GraphDocument}
 * so a hand-edited or third-party file is validated exactly like a freshly
 * authored one.
 */
import { GraphDocumentSchema, migrateV1Document } from "../schema";
import type { GraphDocument } from "../schema";

import { parseCanvasFromUnknown, serialiseCanvasDocument } from "./jsoncanvas";

/** Serialise a document to a pretty JSON string. */
export function serialiseDocument(doc: GraphDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Trigger a browser download of the document as `graphle-export.json`. This is
 * a browser-only side effect: it creates an `<a>` element, clicks it, and
 * revokes the object URL. Outside a DOM environment the browser globals it
 * relies on are absent and the call will throw.
 */
export function exportDocument(doc: GraphDocument): void {
  const blob = new Blob([serialiseDocument(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "graphle-export.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parse a JSON string into a graph document, auto-detecting the format:
 * tries graphle's own v2 schema first, then a v1 graphle document (migrated to
 * v2), and finally JSON Canvas. A file that is none of these throws the canvas
 * codec's Zod error (the last, most generic attempt).
 */
export function importDocument(json: string): GraphDocument {
  const raw: unknown = JSON.parse(json);
  const result = GraphDocumentSchema.safeParse(raw);
  if (result.success) return result.data;
  // A v1 graphle document (version: 1) migrates to v2 and re-validates.
  if (isV1Document(raw)) {
    return GraphDocumentSchema.parse(migrateV1Document(raw));
  }
  return parseCanvasFromUnknown(raw);
}

/**
 * Whether `raw` looks like a v1 graphle document. The authoritative signal is
 * the `version: 1` field that every v1 document carries — and that
 * {@link migrateV1Document} requires to migrate successfully.
 */
function isV1Document(raw: unknown): boolean {
  return isRecord(raw) && raw.version === 1;
}

/** Narrows `unknown` to a record without any cast. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Trigger a browser download of the document as a `.canvas` file (Obsidian
 * JSON Canvas format). Browser-only, same download mechanism as
 * {@link exportDocument}.
 */
export function exportCanvasDocument(doc: GraphDocument): void {
  const blob = new Blob([serialiseCanvasDocument(doc)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "graphle.canvas";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
