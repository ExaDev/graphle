/**
 * Fetching a historical revision of a synced type library — the type-library
 * counterpart to `./gist` and `./github-file`'s graph-document revision
 * fetchers. Reuses their extracted fetch-and-parse-JSON mechanics
 * ({@link fetchGistRevisionJson}, {@link fetchGithubBlobJson}) and decodes
 * the result as a {@link TypeLibraryDocument} instead of a graph document.
 */
import type { TypeLibraryDocument } from "../schema";

import { fetchGistRevisionJson } from "./gist";
import { fetchGithubBlobJson } from "./github-file";
import { decodeTypeLibraryFromJson } from "./type-library-json";

/**
 * Fetch one historical revision of a gist and decode `filename`'s content as
 * a type library document.
 */
export async function fetchGistTypeLibraryRevision(
  gistId: string,
  sha: string,
  filename: string,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<TypeLibraryDocument> {
  const json = await fetchGistRevisionJson(gistId, sha, filename, signal, doFetch);
  return decodeTypeLibraryFromJson(json);
}

/**
 * Fetch one historical revision of a repo file by its exact blob sha and
 * decode it as a type library document.
 */
export async function fetchGithubBlobTypeLibraryRevision(
  owner: string,
  repo: string,
  sha: string,
  token: string | undefined,
  signal: AbortSignal,
  doFetch: typeof globalThis.fetch = globalThis.fetch,
): Promise<TypeLibraryDocument> {
  const json = await fetchGithubBlobJson(owner, repo, sha, token, signal, doFetch);
  return decodeTypeLibraryFromJson(json);
}
