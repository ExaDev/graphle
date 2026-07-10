/**
 * JSON file import/export. Exported files are pretty-printed so they remain
 * diff- and review-friendly; imports round-trip through {@link GraphDocument}
 * so a hand-edited or third-party file is validated exactly like a freshly
 * authored one.
 */
import type { GraphDocument } from "../schema";

import { decodeDocumentFromJson } from "./codec";
import { serialiseCanvasDocument } from "./jsoncanvas";

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
