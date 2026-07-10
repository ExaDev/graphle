/**
 * Loads a graphle document from an arbitrary remote URL — the target of a
 * `#url=` share fragment (see `./url`). The response body is expected to be
 * JSON in one of the shapes {@link decodeDocumentFromJson} recognises (a full
 * graphle document, a compact share envelope, or a JSON Canvas document) —
 * the same shapes a `#g=` fragment decodes to, just uncompressed, since a
 * remote file has no reason to carry the lz-string layer a URL fragment does.
 *
 * graphle has no backend (see the project README), so this fetch runs
 * entirely in the browser and is subject to the target host's CORS policy.
 * Only hosts that grant cross-origin access (e.g. raw.githubusercontent.com,
 * a Gist raw URL, an API response that sets `Access-Control-Allow-Origin`)
 * will succeed. A same-origin human-facing web page — a GitHub repo page, a
 * Projects board UI — is neither CORS-enabled for arbitrary origins nor JSON,
 * so pointing `#url=` at one fails at the fetch or the parse step, not
 * silently: {@link RemoteLoadError} distinguishes exactly where.
 */
import type { GraphDocument } from "../schema";

import { decodeDocumentFromJson, ShareDecodeError } from "./codec";

/**
 * The discriminated set of failures {@link loadDocumentFromUrl} can produce,
 * plus the gist-specific kinds `./gist` adds for the same error type (one
 * error type for the whole remote-loading domain, mirroring how
 * {@link GitHubError} covers every GitHub client failure).
 */
export type RemoteLoadErrorKind =
  | { type: "network"; cause: unknown }
  | { type: "httpError"; status: number }
  | { type: "invalidJson" }
  | { type: "decodeError"; cause: ShareDecodeError }
  | { type: "invalidGistResponse"; message: string }
  | { type: "noGistGraphFiles"; filenames: string[] };

/**
 * Thrown by {@link loadDocumentFromUrl} for any fetch, parse, or decode
 * failure. The {@link kind} discriminator carries the structured detail
 * callers branch on; `message` exists only for logging, mirroring
 * {@link GitHubError}'s pattern for the same reason (a fetch can fail in
 * several genuinely distinct ways a caller may want to react to differently).
 */
export class RemoteLoadError extends Error {
  readonly kind: RemoteLoadErrorKind;

  constructor(kind: RemoteLoadErrorKind) {
    super(messageForKind(kind));
    this.name = "RemoteLoadError";
    this.kind = kind;
  }
}

function messageForKind(kind: RemoteLoadErrorKind): string {
  switch (kind.type) {
    case "network":
      return "Could not reach the remote URL (network error, or blocked by CORS).";
    case "httpError":
      return `Remote URL responded with HTTP ${String(kind.status)}.`;
    case "invalidJson":
      return "Remote URL did not return valid JSON.";
    case "decodeError":
      return `Remote document is malformed: ${kind.cause.message}`;
    case "invalidGistResponse":
      return `Gist API response was malformed: ${kind.message}`;
    case "noGistGraphFiles":
      return kind.filenames.length === 0
        ? "This gist has no files."
        : `This gist has no graph files (found: ${kind.filenames.join(", ")}).`;
  }
}

/**
 * Fetch `url` and decode its JSON body as a {@link GraphDocument}. `fetch` is
 * injectable so tests can stub responses without touching the network; when
 * omitted the global `fetch` is used, mirroring {@link createGitHubClient}.
 * A rejected fetch (network failure or an aborted `signal`) and a non-2xx
 * response are reported as distinct {@link RemoteLoadError} kinds rather than
 * both surfacing as a generic failure.
 */
export async function loadDocumentFromUrl(
  url: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GraphDocument> {
  let response: Response;
  try {
    response = await doFetch(url, { signal });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError({ type: "httpError", status: response.status });
  }

  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }

  try {
    return decodeDocumentFromJson(json);
  } catch (error) {
    if (error instanceof ShareDecodeError) {
      throw new RemoteLoadError({ type: "decodeError", cause: error });
    }
    throw error;
  }
}
