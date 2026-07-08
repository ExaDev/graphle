/**
 * JSON file import/export. Exported files are pretty-printed so they remain
 * diff- and review-friendly; imports round-trip through {@link GraphDocument}
 * so a hand-edited or third-party file is validated exactly like a freshly
 * authored one.
 */
import { GraphDocument } from "../schema";

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

/** Parse and validate a JSON string into a graph document. */
export function importDocument(json: string): GraphDocument {
  const raw: unknown = JSON.parse(json);
  return GraphDocument.parse(raw);
}
