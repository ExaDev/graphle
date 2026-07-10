/**
 * GitHub repo-file awareness via the REST Contents API
 * (`/repos/{owner}/{repo}/contents/{path}`) — the read/write counterpart to
 * `./gist` for the `"githubFile"` linked-remote provider: one specific file
 * at one specific branch in one specific repo, rather than a gist's
 * ambiguous multi-file bag, so there is no disambiguation step here at all —
 * every function takes the fully-resolved `{owner, repo, branch, path}` from
 * {@link parseGithubFileUrl} (see `./github-file-url`) or a stored
 * `LinkedRemoteSource`.
 *
 * Reads work unauthenticated for a public repo — `api.github.com` sends
 * `Access-Control-Allow-Origin: *` unauthenticated (same as the gist API,
 * see `./gist`'s module doc), just far more rate-limited without a token —
 * so `token` is optional throughout and only added to the request when the
 * caller has one. Writes ({@link pushGithubFileContent}) always require a
 * token: the Contents API's PUT endpoint is access-controlled, exactly like
 * a gist's PATCH.
 *
 * The Contents API's `sha` is a git blob sha, not a commit sha, and doubles
 * as this module's revision identifier — the same role a gist's `history[].version`
 * plays in `./gist`. Pulling an exact historical revision (rather than
 * whatever is currently on the branch) therefore uses the separate git Blob
 * API (`/repos/{owner}/{repo}/git/blobs/{sha}`), which fetches by blob sha
 * directly regardless of what the branch points at now — the Contents API's
 * own `ref` query param only accepts a commit-ish (branch, tag, or commit
 * sha), not a blob sha, so it cannot re-fetch an older blob once the branch
 * has moved past it.
 */
import { z } from "zod";

import type { GraphDocument } from "../schema";

import { decodeDocumentFromJson, ShareDecodeError } from "./codec";
import { classifyGithubRestStatus } from "./github-rest-errors";
import { RemoteLoadError } from "./remote";

const GITHUB_API_ROOT = "https://api.github.com";

function contentsUrl(owner: string, repo: string, path: string): string {
  return `${GITHUB_API_ROOT}/repos/${owner}/${repo}/contents/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function blobUrl(owner: string, repo: string, sha: string): string {
  return `${GITHUB_API_ROOT}/repos/${owner}/${repo}/git/blobs/${sha}`;
}

function authHeaders(token: string | undefined): HeadersInit {
  return token === undefined ? {} : { Authorization: `Bearer ${token}` };
}

/** The `sha`/`content`/`encoding` shape shared by a Contents API read and a
 *  git Blob API read — both return base64-encoded file content alongside its
 *  blob sha, just reached via a different identifier (a branch-relative path
 *  vs. the blob sha itself). */
const GithubBlobShape = z.object({
  sha: z.string(),
  content: z.string(),
  encoding: z.literal("base64"),
});

/** The Contents API's response to a successful PUT — the write-result shape
 *  a gist's PATCH response carries as `history[0]`, just nested under
 *  `content` instead. */
const GithubPutResponseSchema = z.object({
  content: z.object({ sha: z.string() }),
});

/** decode base64 to a UTF-8 string; no `Buffer` in a browser runtime. */
function decodeBase64(base64: string): string {
  const binary = atob(base64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** encode a UTF-8 string to base64; the inverse of {@link decodeBase64}. */
function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** Shared GET + status-classify + schema-parse for both the Contents API and
 *  the Blob API — the only difference between the two call sites is the URL
 *  built and the schema is identical, since both return `{sha, content, encoding}`. */
async function fetchBlobShape(
  url: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch,
): Promise<z.infer<typeof GithubBlobShape>> {
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { Accept: "application/vnd.github+json", ...authHeaders(token) },
      signal,
    });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError(classifyGithubRestStatus(response.status));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }
  const parsed = GithubBlobShape.safeParse(json);
  if (!parsed.success) {
    throw new RemoteLoadError({
      type: "invalidGithubFileResponse",
      message: parsed.error.message,
    });
  }
  return parsed.data;
}

/** Decode a fetched blob's base64 content as parsed JSON, without deciding
 *  what document shape it is. */
function parseBlobContentJson(content: string): unknown {
  const text = decodeBase64(content);
  try {
    return JSON.parse(text);
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }
}

/** Decode a parsed JSON value as a graph document. */
function decodeGraphDocumentJson(json: unknown): GraphDocument {
  try {
    return decodeDocumentFromJson(json);
  } catch (error) {
    if (error instanceof ShareDecodeError) {
      throw new RemoteLoadError({ type: "decodeError", cause: error });
    }
    throw error;
  }
}

/** One fetched revision of a repo file: its decoded graph document and blob sha. */
export interface GithubFileRevision {
  document: GraphDocument;
  sha: string;
}

/** One entry in a repo file's commit history — a single commit that touched
 *  `path`, newest first, mirroring `./gist`'s `GistHistoryEntry`. */
export interface GithubFileHistoryEntry {
  sha: string;
  committedAt: string;
  message: string;
  authorLogin: string | undefined;
}

/** The `GET /repos/{owner}/{repo}/commits` response shape, narrowed to what
 *  {@link listGithubFileHistory} needs — `commit.author.date` is the git
 *  commit's own author timestamp, always present since every git commit has
 *  one, distinct from the top-level `author` (the GitHub account GitHub
 *  matched to the commit's email), which is `null` when no account matches. */
const GithubCommitEntrySchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: z.object({ date: z.string() }),
  }),
  author: z.object({ login: z.string() }).nullable(),
});

/**
 * Fetch a repo file's current content on `branch` (`GET
 * /repos/{owner}/{repo}/contents/{path}?ref={branch}`) and parse it as JSON,
 * without deciding what document shape it is, alongside its current blob sha
 * — the shared HTTP-fetch-plus-JSON-parse mechanics behind {@link
 * fetchGithubFileRevision}, factored out so a differently-shaped document
 * synced to a repo file (e.g. a type library) can reuse the same fetch
 * without inheriting the graph-specific decode.
 */
export async function fetchGithubContentsJson(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<{ json: unknown; sha: string }> {
  const blob = await fetchBlobShape(
    `${contentsUrl(owner, repo, path)}?ref=${encodeURIComponent(branch)}`,
    token,
    signal,
    doFetch,
  );
  return { json: parseBlobContentJson(blob.content), sha: blob.sha };
}

/**
 * Fetch a repo file's current content on `branch` and decode it as a graph
 * document, alongside its current blob sha, via {@link fetchGithubContentsJson}.
 */
export async function fetchGithubFileRevision(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GithubFileRevision> {
  const { json, sha } = await fetchGithubContentsJson(
    owner,
    repo,
    branch,
    path,
    token,
    signal,
    doFetch,
  );
  return { document: decodeGraphDocumentJson(json), sha };
}

/**
 * Fetch just a repo file's current blob sha on `branch`, without decoding its
 * content as a document — the cheap conflict-check read {@link
 * useGithubFileAutoSync} and {@link SyncConflictModal}'s "keep mine" path use
 * to compare against `linkedRemote.lastSyncedRevision`, mirroring how {@link
 * listGistHistory} lets a caller check a gist's HEAD without decoding every
 * file's content.
 */
export async function fetchGithubFileSha(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  const blob = await fetchBlobShape(
    `${contentsUrl(owner, repo, path)}?ref=${encodeURIComponent(branch)}`,
    token,
    signal,
    doFetch,
  );
  return blob.sha;
}

/**
 * Fetch one historical revision of a repo file by its exact blob sha (`GET
 * /repos/{owner}/{repo}/git/blobs/{sha}`) and parse it as JSON, without
 * deciding what document shape it is — the git Blob API, not the Contents
 * API, since a blob sha is not a valid `ref` for the latter (see the module
 * doc). The shared HTTP-fetch-plus-JSON-parse mechanics behind {@link
 * fetchGithubBlobRevision}, factored out so a differently-shaped document
 * synced to a repo file (e.g. a type library) can reuse the same fetch
 * without inheriting the graph-specific decode.
 */
export async function fetchGithubBlobJson(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<unknown> {
  const blob = await fetchBlobShape(blobUrl(owner, repo, sha), token, signal, doFetch);
  return parseBlobContentJson(blob.content);
}

/**
 * Fetch one historical revision of a repo file by its exact blob sha and
 * decode it as a graph document, via {@link fetchGithubBlobJson}. This is
 * what "take theirs" conflict resolution uses to pull exactly the revision
 * that was detected as the divergent remote HEAD, even if the branch has
 * since moved again.
 */
export async function fetchGithubBlobRevision(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GraphDocument> {
  const json = await fetchGithubBlobJson(owner, repo, sha, token, signal, doFetch);
  return decodeGraphDocumentJson(json);
}

/**
 * List a repo file's commit history — every commit that touched `path` on
 * `branch`, newest first (`GET /repos/{owner}/{repo}/commits?path=&sha=`),
 * mirroring {@link listGistHistory} in `./gist`. Stays unauthenticated for a
 * public repo, same as every other read in this module — this is what makes
 * "see the history even without write access" hold for a repo file the same
 * way it already does for a gist.
 */
export async function listGithubFileHistory(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<GithubFileHistoryEntry[]> {
  const url = `${GITHUB_API_ROOT}/repos/${owner}/${repo}/commits?${new URLSearchParams({
    path,
    sha: branch,
  }).toString()}`;
  let response: Response;
  try {
    response = await doFetch(url, {
      headers: { Accept: "application/vnd.github+json", ...authHeaders(token) },
      signal,
    });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError(classifyGithubRestStatus(response.status));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }
  const parsed = z.array(GithubCommitEntrySchema).safeParse(json);
  if (!parsed.success) {
    throw new RemoteLoadError({
      type: "invalidGithubFileResponse",
      message: parsed.error.message,
    });
  }
  return parsed.data.map((entry) => ({
    sha: entry.sha,
    committedAt: entry.commit.author.date,
    message: entry.commit.message,
    authorLogin: entry.author?.login,
  }));
}

/**
 * Push new content for a repo file (`PUT /repos/{owner}/{repo}/contents/{path}`)
 * — the write-capable counterpart to {@link fetchGithubFileRevision}, mirroring
 * {@link pushGistFile}. `sha` must be the file's current blob sha (from a
 * fresh {@link fetchGithubFileSha} read) so GitHub can detect a concurrent
 * write; pass `undefined` only when creating a file that doesn't exist yet.
 * Returns the new blob sha.
 */
export async function pushGithubFileContent(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  content: string,
  sha: string | undefined,
  token: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await doFetch(contentsUrl(owner, repo, path), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Update ${path} via graphle`,
        content: encodeBase64(content),
        branch,
        ...(sha === undefined ? {} : { sha }),
      }),
      signal,
    });
  } catch (cause) {
    throw new RemoteLoadError({ type: "network", cause });
  }
  if (!response.ok) {
    throw new RemoteLoadError(classifyGithubRestStatus(response.status));
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new RemoteLoadError({ type: "invalidJson" });
  }
  const parsed = GithubPutResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new RemoteLoadError({
      type: "invalidGithubFileResponse",
      message: parsed.error.message,
    });
  }
  return parsed.data.content.sha;
}
