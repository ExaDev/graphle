/**
 * GitHub Gist awareness layered on top of `./remote`'s generic URL loader.
 *
 * A gist can hold several files, and two of its URL shapes name the gist as a
 * WHOLE rather than one file: the human-facing gist page (HTML — fails at
 * fetch, CORS-blocked from arbitrary origins) and the filename-less raw
 * endpoint (`.../raw` with no file segment), which silently resolves to
 * whichever file GitHub picks first rather than erroring — confirmed
 * empirically against a real multi-file gist, not documented behaviour to
 * rely on. Both are genuinely ambiguous: there is no way to tell from the URL
 * alone which file — if any — the caller meant.
 *
 * {@link resolveRemoteUrl} is the drop-in replacement for calling {@link
 * loadDocumentFromUrl} directly: a URL that already names one specific file
 * (the common case — a raw URL with a commit hash and filename) passes
 * straight through unchanged. Only an ambiguous gist URL triggers the extra
 * step, listing every file via the public Gist API and classifying which
 * ones decode as a graph document, so the caller can auto-load the one
 * unambiguous candidate or prompt when there is more than one.
 *
 * The Gist API call needs no auth: a secret gist is unlisted, not
 * access-controlled — anyone with the id can read it, same as the gist page
 * itself — and `api.github.com` sends `Access-Control-Allow-Origin: *` even
 * unauthenticated (confirmed empirically), so this stays in the same
 * no-PAT-required tier as the rest of the generic `#url=` loader.
 */
import { z } from "zod";

import type { GraphDocument } from "../schema";

import { decodeDocumentFromJson, ShareDecodeError } from "./codec";
import { classifyGithubRestStatus } from "./github-rest-errors";
import { loadDocumentFromUrl, RemoteLoadError } from "./remote";

const GIST_API_ENDPOINT = "https://api.github.com/gists";

/**
 * Matches a gist page (`gist.github.com/<user>/<id>` or `gist.github.com/<id>`)
 * — a human-facing HTML page, not fetchable JSON at all.
 */
const GIST_PAGE_PATTERN = /^https:\/\/gist\.github\.com\/(?:[^/]+\/)?([0-9a-f]{20,40})\/?$/i;

/**
 * Matches the filename-less raw prefix (`gist.githubusercontent.com/<user>/<id>/raw`
 * or with a trailing slash) — fetchable, but silently resolves to one
 * arbitrary file with no indication others exist.
 */
const GIST_RAW_BARE_PATTERN =
  /^https:\/\/gist\.githubusercontent\.com\/[^/]+\/([0-9a-f]{20,40})\/raw\/?$/i;

/**
 * Extract a gist id from a URL that names the gist as a whole, needing
 * disambiguation. Returns `undefined` for anything else, including a raw URL
 * that already names a specific file (`.../raw/<commit>/<filename>` or
 * `.../raw/<filename>`) — that case is unambiguous and never reaches this
 * module; it loads straight through {@link loadDocumentFromUrl}.
 */
export function parseAmbiguousGistUrl(url: string): string | undefined {
  const pageMatch = GIST_PAGE_PATTERN.exec(url);
  if (pageMatch?.[1] !== undefined) return pageMatch[1];
  const rawMatch = GIST_RAW_BARE_PATTERN.exec(url);
  if (rawMatch?.[1] !== undefined) return rawMatch[1];
  return undefined;
}

/** One file in a gist's API response, narrowed to what classification needs. */
const GistApiFileSchema = z.object({
  filename: z.string(),
  raw_url: z.string(),
  truncated: z.boolean(),
  content: z.string().optional(),
});

/** The `id`/`files` shape shared by every gist API response, including a single historical revision. */
const GistFilesResponseSchema = z.object({
  id: z.string(),
  files: z.record(z.string(), GistApiFileSchema),
});

/** One entry in a gist's `history` array — a single committed revision. */
const GistHistoryEntrySchema = z.object({
  version: z.string(),
  committed_at: z.string(),
  change_status: z.object({
    additions: z.number(),
    deletions: z.number(),
  }),
  url: z.string(),
  user: z.object({ login: z.string() }).nullable(),
});
export type GistHistoryEntry = z.infer<typeof GistHistoryEntrySchema>;

/**
 * The full gist listing response (`GET /gists/{id}`), which additionally
 * carries `history` — every historical revision, newest first. A single
 * revision fetched via `GET /gists/{id}/{sha}` shares the `files` shape but
 * carries no `history` of its own, hence {@link GistFilesResponseSchema} is
 * kept separate and this schema extends it rather than the other way round.
 */
const GistApiResponseSchema = GistFilesResponseSchema.extend({
  history: z.array(GistHistoryEntrySchema),
});
type GistApiResponse = z.infer<typeof GistApiResponseSchema>;

/** One file in a gist, classified as a graph document or not. */
export interface GistFileCandidate {
  filename: string;
  rawUrl: string;
  /** Set when the file's content decoded as a graph document. */
  document: GraphDocument | undefined;
  /** Set when decoding failed; `undefined` exactly when `document` is set. */
  error: string | undefined;
}

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read a gist API file's full content. Small files carry `content` inline in
 * the listing response; a `truncated` file's `content` is only a prefix, so
 * the full text is re-fetched from `raw_url`.
 */
async function fullFileContent(
  file: z.infer<typeof GistApiFileSchema>,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch,
): Promise<string> {
  if (!file.truncated && file.content !== undefined) {
    return file.content;
  }
  const response = await doFetch(file.raw_url, { signal });
  if (!response.ok) {
    throw new RemoteLoadError({ type: "httpError", status: response.status });
  }
  return response.text();
}

/** Classify one gist file: does its content decode as a graph document? */
async function classifyFile(
  file: z.infer<typeof GistApiFileSchema>,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch,
): Promise<GistFileCandidate> {
  try {
    const text = await fullFileContent(file, signal, doFetch);
    const json: unknown = JSON.parse(text);
    const document = decodeDocumentFromJson(json);
    return { filename: file.filename, rawUrl: file.raw_url, document, error: undefined };
  } catch (error) {
    return {
      filename: file.filename,
      rawUrl: file.raw_url,
      document: undefined,
      error: describe(error),
    };
  }
}

/**
 * Parse a gist API response body against `schema`, translating a JSON parse
 * failure or a schema mismatch into the matching {@link RemoteLoadError} kind.
 * Shared by every gist endpoint response (listing, a single revision, a push
 * result) so the parse-failure handling stays in one place.
 */
async function parseGistBody<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new RemoteLoadError({
      type: "invalidGistResponse",
      message: parsed.error.message,
    });
  }
  return parsed.data;
}

/**
 * Fetch a gist's full API response (files plus history) from
 * `GET /gists/{id}`. Shared by {@link listGistFiles} and
 * {@link listGistHistory} — both need the same unauthenticated read, just a
 * different field of the result. Stays unauthenticated like the rest of this
 * module: gist reads need no auth, see the module docblock.
 */
async function fetchGistApiResponse(
  gistId: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch,
): Promise<GistApiResponse> {
  let response: Response;
  try {
    response = await doFetch(`${GIST_API_ENDPOINT}/${gistId}`, { signal });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError({ type: "httpError", status: response.status });
  }
  return parseGistBody(response, GistApiResponseSchema);
}

/**
 * Fetch a gist's files via the public Gist API and classify each as a graph
 * document or not. `fetch` is injectable so tests can stub responses without
 * touching the network, mirroring {@link loadDocumentFromUrl}.
 */
export async function listGistFiles(
  gistId: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GistFileCandidate[]> {
  const response = await fetchGistApiResponse(gistId, signal, doFetch);
  return Promise.all(
    Object.values(response.files).map((file) => classifyFile(file, signal, doFetch)),
  );
}

/**
 * List a gist's revision history — every committed version, newest first.
 * Stays unauthenticated, exactly like {@link listGistFiles}: gist reads need
 * no auth, so history is visible with zero PAT or a read-only PAT.
 */
export async function listGistHistory(
  gistId: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GistHistoryEntry[]> {
  const response = await fetchGistApiResponse(gistId, signal, doFetch);
  return response.history;
}

/**
 * Fetch one historical revision of a gist (`GET /gists/{id}/{sha}`) and
 * decode `filename`'s content as a graph document. A revision response
 * shares the `files` shape of a listing response but carries no `history` of
 * its own, hence {@link GistFilesResponseSchema} rather than
 * {@link GistApiResponseSchema} here.
 */
export async function fetchGistRevision(
  gistId: string,
  sha: string,
  filename: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GraphDocument> {
  let response: Response;
  try {
    response = await doFetch(`${GIST_API_ENDPOINT}/${gistId}/${sha}`, { signal });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError({ type: "httpError", status: response.status });
  }

  const parsed = await parseGistBody(response, GistFilesResponseSchema);
  const file = parsed.files[filename];
  if (file === undefined) {
    throw new RemoteLoadError({ type: "gistFileNotFound", filename });
  }

  const text = await fullFileContent(file, signal, doFetch);
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

/**
 * Push new content for one file in a gist (`PATCH /gists/{id}`) — the first
 * write-capable GitHub API call in this codebase, hence the only function in
 * this module that requires a token: gist writes are access-controlled,
 * unlike the reads above. Returns the new HEAD sha (the version of the
 * revision the push just created), read off the front of the response's
 * fresh `history` array.
 */
export async function pushGistFile(
  gistId: string,
  filename: string,
  content: string,
  token: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await doFetch(`${GIST_API_ENDPOINT}/${gistId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ files: { [filename]: { content } } }),
      signal,
    });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError(classifyGithubRestStatus(response.status));
  }

  const parsed = await parseGistBody(response, GistApiResponseSchema);
  const latest = parsed.history[0];
  if (latest === undefined) {
    throw new RemoteLoadError({
      type: "invalidGistResponse",
      message: "gist history is empty after push",
    });
  }
  return latest.version;
}

/** The outcome of {@link resolveRemoteUrl}. */
export type RemoteResolution =
  | { kind: "loaded"; document: GraphDocument; resolvedUrl: string }
  | { kind: "ambiguousGist"; gistId: string; candidates: GistFileCandidate[] };

/**
 * The gist-aware entry point for loading a `#url=` target: a URL that already
 * names one specific file loads straight through {@link loadDocumentFromUrl}
 * unchanged. A URL that names a gist as a whole is disambiguated first —
 * exactly one graph-file candidate auto-resolves (no prompt needed, the only
 * sensible choice); more than one is reported as `"ambiguousGist"` so the
 * caller can offer a picker; zero throws {@link RemoteLoadError} with kind
 * `noGistGraphFiles`, naming every file that was found.
 */
export async function resolveRemoteUrl(
  url: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<RemoteResolution> {
  const gistId = parseAmbiguousGistUrl(url);
  if (gistId === undefined) {
    const document = await loadDocumentFromUrl(url, signal, doFetch);
    return { kind: "loaded", document, resolvedUrl: url };
  }

  const files = await listGistFiles(gistId, signal, doFetch);
  const candidates = files.filter(
    (file): file is GistFileCandidate & { document: GraphDocument } =>
      file.document !== undefined,
  );

  if (candidates.length === 0) {
    throw new RemoteLoadError({
      type: "noGistGraphFiles",
      filenames: files.map((file) => file.filename),
    });
  }
  if (candidates.length === 1) {
    const only = candidates[0];
    if (only === undefined) throw new Error("unreachable: length-1 array has index 0");
    return { kind: "loaded", document: only.document, resolvedUrl: only.rawUrl };
  }
  return { kind: "ambiguousGist", gistId, candidates };
}
