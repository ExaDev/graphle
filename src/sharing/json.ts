/**
 * JSON file import/export. Exported files are pretty-printed so they remain
 * diff- and review-friendly; imports round-trip through {@link GraphDocument}
 * so a hand-edited or third-party file is validated exactly like a freshly
 * authored one.
 */
import type { GraphDocument } from "../schema";

import { decodeDocumentFromJson } from "./codec";
import { triggerDownload } from "./download";
import { serialiseCanvasDocument } from "./jsoncanvas";

/** Serialise a document to a pretty JSON string. */
export function serialiseDocument(doc: GraphDocument): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Trigger a browser download of the document as `graphle-export.json`. See
 * {@link triggerDownload} for the underlying browser-only side effect.
 */
export function exportDocument(doc: GraphDocument): void {
  triggerDownload(serialiseDocument(doc), "graphle-export.json", "application/json");
}

/**
 * Parse a JSON string into a graph document, auto-detecting the format via
 * {@link decodeDocumentFromJson}: graphle's own current schema, a v1 or v2
 * graphle document (migrated forward), or JSON Canvas — the same detection
 * every other document entry point (the `#g=` share fragment, a fetched
 * remote URL) uses, so a hand-edited or third-party file is validated
 * identically regardless of how it reached the app.
 */
export function importDocument(json: string): GraphDocument {
  const raw: unknown = JSON.parse(json);
  return decodeDocumentFromJson(raw);
}

/**
 * Trigger a browser download of the document as a `.canvas` file (Obsidian
 * JSON Canvas format). See {@link triggerDownload} for the underlying
 * browser-only side effect.
 */
export function exportCanvasDocument(doc: GraphDocument): void {
  triggerDownload(serialiseCanvasDocument(doc), "graphle.canvas", "application/json");
}
