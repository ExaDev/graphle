/**
 * Location read/write helpers for the share fragment. Two mutually exclusive
 * hash keys carry a graph: `#g=` inlines a compressed document (never touches
 * the server, survives a static-host reload — GitHub Pages has no routing
 * backend); `#url=` instead carries a remote URL to fetch and load (see
 * `./remote`) — the address bar is a live pointer rather than a frozen
 * snapshot, until the user edits and the debounced writer in `useUrlSync`
 * overwrites it with a `#g=` snapshot of those edits.
 *
 * The `#url=` target is embedded RAW, not percent-encoded. A well-formed URL
 * is already composed entirely of characters the fragment grammar (RFC 3986
 * §3.5) permits unescaped — letters, digits, `: / ? # [ ] @ ! $ & ' ( ) * + ,
 * ; = - . _ ~` — because any character that isn't safe in a URL (a space, a
 * non-ASCII character) has already been percent-encoded by whoever produced
 * that URL in the first place. Encoding it a second time here would only
 * turn a readable, copy-pasteable address bar into a wall of `%3A%2F%2F`.
 * Reading is symmetric: the raw remainder of the hash IS the target URL, no
 * decode step.
 */
import type { GraphDocument } from "../schema";

import { decodeDocument, encodeDocument } from "./codec";

/** Hash key carrying the compressed, inline share payload. */
export const HASH_KEY = "g";
/** Hash key carrying a remote URL to fetch and load as a document. */
export const REMOTE_HASH_KEY = "url";

const HASH_PREFIX = `#${HASH_KEY}=`;
const REMOTE_HASH_PREFIX = `#${REMOTE_HASH_KEY}=`;

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

/**
 * Read the target URL from a `#url=` fragment, if present — the raw remainder
 * of the hash, unmodified. A pure hash read with no fetch, mirroring {@link
 * readDocumentFromLocation} for the inline `#g=` case — the caller
 * (`useUrlSync`) is responsible for actually fetching it via
 * `loadDocumentFromUrl`.
 */
export function readRemoteUrlFromLocation(
  loc: Pick<Location, "hash"> = window.location,
): string | undefined {
  if (!loc.hash.startsWith(REMOTE_HASH_PREFIX)) return undefined;
  return loc.hash.slice(REMOTE_HASH_PREFIX.length);
}

/**
 * Build the full shareable URL (origin + pathname + `#url=` payload) that
 * points at a remote document rather than inlining one. Mirrors {@link
 * buildShareUrl}.
 */
export function buildRemoteShareUrl(
  targetUrl: string,
  loc: Pick<Location, "hash"> & { origin: string; pathname: string } = window.location,
): string {
  return `${loc.origin}${loc.pathname}${REMOTE_HASH_PREFIX}${targetUrl}`;
}

/**
 * Replace the current history entry with a `#url=` fragment pointing at
 * `targetUrl`, so the address bar stays shareable after a URL-sourced load.
 * Mirrors {@link writeDocumentToLocation}.
 */
export function writeRemoteUrlToLocation(
  targetUrl: string,
  loc: Pick<Location, "hash"> & { origin: string; pathname: string } = window.location,
  replace: (url: string) => void = (url) => history.replaceState(null, "", url),
): void {
  replace(buildRemoteShareUrl(targetUrl, loc));
}
