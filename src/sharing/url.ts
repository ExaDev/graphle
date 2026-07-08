/**
 * Location read/write helpers for the share fragment. The share payload lives
 * behind the `#g=` hash key so it never touches the server and survives a
 * static-host reload (GitHub Pages has no routing backend).
 */
import type { GraphDocument } from "../schema";

import { decodeDocument, encodeDocument } from "./codec";

/** Hash key carrying the compressed share payload. */
export const HASH_KEY = "g";

const HASH_PREFIX = `#${HASH_KEY}=`;

/** Extract the payload after `#g=`, or `undefined` when the key is absent. */
function extractPayload(hash: string): string | undefined {
  if (!hash.startsWith(HASH_PREFIX)) return undefined;
  return hash.slice(HASH_PREFIX.length);
}

/**
 * Read a shared document from a location's hash. Returns `undefined` when no
 * `#g=` fragment is present; when one is present the payload is decoded and
 * any {@link decodeDocument} error propagates to the caller unchanged.
 */
export function readDocumentFromLocation(
  loc: Pick<Location, "hash"> = window.location,
): { document: GraphDocument } | undefined {
  const payload = extractPayload(loc.hash);
  if (payload === undefined) return undefined;
  return { document: decodeDocument(payload) };
}

/**
 * Build the full shareable URL (origin + pathname + `#g=` payload) for a
 * document, using `loc` for the base.
 */
export function buildShareUrl(
  doc: GraphDocument,
  loc: Pick<Location, "hash"> & { origin: string; pathname: string } = window.location,
): string {
  return `${loc.origin}${loc.pathname}${HASH_PREFIX}${encodeDocument(doc)}`;
}

/**
 * Replace the current history entry with a URL carrying the encoded document,
 * keeping the address bar shareable without adding a new history step.
 */
export function writeDocumentToLocation(
  doc: GraphDocument,
  loc: Pick<Location, "hash"> & { origin: string; pathname: string } = window.location,
  replace: (url: string) => void = (url) => history.replaceState(null, "", url),
): void {
  replace(buildShareUrl(doc, loc));
}
