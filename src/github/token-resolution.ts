import type { StoredGithubToken } from "../schema";

/**
 * Picks the best stored token for `owner` (undefined for an owner-agnostic
 * call, e.g. a gist). Tier 0: `pinnedTokenId`, if it names a token that
 * still exists — callers pass a link's `lastUsedTokenId` here to keep a
 * gist/file sync sticky to whichever token last synced it successfully,
 * rather than drifting with whatever was most recently used elsewhere.
 * Tier 1: an owner-scoped token whose `scope.owners` includes `owner`, ties
 * broken by fewest owners (most specific) then most recent use — a token
 * scoped to exactly `["ExaDev"]` outranks one scoped to
 * `["ExaDev","Other"]` for an ExaDev node regardless of validation recency,
 * so expanding an unrelated org's node can never reprioritise it. Tier 2:
 * an any-scoped token, most recently used first. Returns undefined if
 * nothing matches any tier.
 */
export function resolveTokenForOwner(
  tokens: StoredGithubToken[],
  owner: string | undefined,
  pinnedTokenId?: string,
): StoredGithubToken | undefined {
  if (pinnedTokenId !== undefined) {
    const pinned = tokens.find((candidate) => candidate.id === pinnedTokenId);
    if (pinned !== undefined) return pinned;
  }

  const byRecency = (a: StoredGithubToken, b: StoredGithubToken): number =>
    (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? "");

  if (owner !== undefined) {
    const owned = tokens
      .filter(
        (candidate): candidate is StoredGithubToken & { scope: { kind: "owner"; owners: string[] } } =>
          candidate.scope.kind === "owner" && candidate.scope.owners.includes(owner),
      )
      .sort((a, b) => {
        const bySpecificity = a.scope.owners.length - b.scope.owners.length;
        return bySpecificity !== 0 ? bySpecificity : byRecency(a, b);
      });
    const best = owned[0];
    if (best !== undefined) return best;
  }

  const any = tokens.filter((candidate) => candidate.scope.kind === "any").sort(byRecency);
  return any[0];
}
