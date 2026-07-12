import type { StoredGithubToken } from "../schema";
import { db } from "../storage/db";
import { createGithubTokenStore } from "../storage/github-token-store-dexie";
import type { GitHubClient } from "./contract";
import { createGitHubClient } from "./graphql-adapter";
import { resolveTokenForOwner } from "./token-resolution";

/**
 * Loads every stored GitHub token and resolves the best match for `owner`
 * per {@link resolveTokenForOwner}, touching its `lastUsedAt` as a side
 * effect of a successful resolution. Returns the full stored record (not a
 * bare string) since callers need both `.token` and `.id` — the latter to
 * pin a sync link's `lastUsedTokenId` after a successful push/pull.
 */
export async function resolveGithubToken(
  owner: string | undefined,
  signal: AbortSignal,
  pinnedTokenId?: string,
): Promise<StoredGithubToken | undefined> {
  const store = createGithubTokenStore(db);
  const tokens = await store.list(signal);
  const resolved = resolveTokenForOwner(tokens, owner, pinnedTokenId);
  if (resolved !== undefined) void store.touchLastUsed(resolved.id, signal);
  return resolved;
}

/** Resolves a token for `owner` and builds a {@link GitHubClient} from it,
 *  or returns undefined when no token resolves. */
export async function resolveGithubClient(
  owner: string | undefined,
  signal: AbortSignal,
  pinnedTokenId?: string,
): Promise<GitHubClient | undefined> {
  const resolved = await resolveGithubToken(owner, signal, pinnedTokenId);
  return resolved === undefined ? undefined : createGitHubClient({ token: resolved.token });
}
