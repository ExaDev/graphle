import { describe, expect, it } from "vitest";

import type { StoredGithubToken } from "../schema";
import { resolveTokenForOwner } from "./token-resolution";

function makeToken({
  id,
  label = id,
  tokenType = "classic",
  token = `token-${id}`,
  scope = { kind: "any" },
  createdAt = "2024-01-01T00:00:00Z",
  lastUsedAt,
}: {
  id: string;
  label?: string;
  tokenType?: StoredGithubToken["tokenType"];
  token?: string;
  scope?: StoredGithubToken["scope"];
  createdAt?: string;
  lastUsedAt?: string;
}): StoredGithubToken {
  return {
    id,
    label,
    tokenType,
    token,
    scope,
    createdAt,
    ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
  };
}

describe("resolveTokenForOwner", () => {
  it("returns undefined for an empty token list", () => {
    expect(resolveTokenForOwner([], "ExaDev")).toBeUndefined();
    expect(resolveTokenForOwner([], undefined)).toBeUndefined();
  });

  it("tier 0: returns the pinned token when it exists", () => {
    const pinned = makeToken({ id: "pinned", scope: { kind: "owner", owners: ["Other"] } });
    const other = makeToken({ id: "other", scope: { kind: "any" } });
    expect(resolveTokenForOwner([pinned, other], "ExaDev", "pinned")).toBe(pinned);
  });

  it("tier 0: falls through to normal resolution when the pinned id no longer exists", () => {
    const owned = makeToken({ id: "owned", scope: { kind: "owner", owners: ["ExaDev"] } });
    expect(resolveTokenForOwner([owned], "ExaDev", "stale-id")).toBe(owned);
  });

  it("tier 1: prefers an owner-scoped token over an any-scoped token", () => {
    const any = makeToken({ id: "any", scope: { kind: "any" } });
    const owned = makeToken({ id: "owned", scope: { kind: "owner", owners: ["ExaDev"] } });
    expect(resolveTokenForOwner([any, owned], "ExaDev")).toBe(owned);
  });

  it("tier 1: breaks ties by specificity — fewer owners wins", () => {
    const broad = makeToken({ id: "broad", scope: { kind: "owner", owners: ["ExaDev", "Other"] } });
    const narrow = makeToken({ id: "narrow", scope: { kind: "owner", owners: ["ExaDev"] } });
    expect(resolveTokenForOwner([broad, narrow], "ExaDev")).toBe(narrow);
  });

  it("tier 1: breaks equal-specificity ties by most recent use", () => {
    const older = makeToken({
      id: "older",
      scope: { kind: "owner", owners: ["ExaDev"] },
      lastUsedAt: "2024-01-01T00:00:00Z",
    });
    const newer = makeToken({
      id: "newer",
      scope: { kind: "owner", owners: ["ExaDev"] },
      lastUsedAt: "2024-06-01T00:00:00Z",
    });
    expect(resolveTokenForOwner([older, newer], "ExaDev")).toBe(newer);
  });

  it("tier 1: specificity always wins over recency, even for an unrelated owner", () => {
    const broadRecent = makeToken({
      id: "broad-recent",
      scope: { kind: "owner", owners: ["ExaDev", "Other"] },
      lastUsedAt: "2024-06-01T00:00:00Z",
    });
    const narrowStale = makeToken({
      id: "narrow-stale",
      scope: { kind: "owner", owners: ["ExaDev"] },
      lastUsedAt: "2024-01-01T00:00:00Z",
    });
    expect(resolveTokenForOwner([broadRecent, narrowStale], "ExaDev")).toBe(narrowStale);
  });

  it("tier 2: returns the most recently used any-scoped token when owner is undefined", () => {
    const older = makeToken({ id: "older", lastUsedAt: "2024-01-01T00:00:00Z" });
    const newer = makeToken({ id: "newer", lastUsedAt: "2024-06-01T00:00:00Z" });
    expect(resolveTokenForOwner([older, newer], undefined)).toBe(newer);
  });

  it("tier 2: falls through to an any-scoped token when no owner-scoped token matches", () => {
    const unrelated = makeToken({ id: "unrelated", scope: { kind: "owner", owners: ["Other"] } });
    const any = makeToken({ id: "any", scope: { kind: "any" } });
    expect(resolveTokenForOwner([unrelated, any], "ExaDev")).toBe(any);
  });

  it("returns undefined when owner is set but nothing matches any tier", () => {
    const unrelated = makeToken({ id: "unrelated", scope: { kind: "owner", owners: ["Other"] } });
    expect(resolveTokenForOwner([unrelated], "ExaDev")).toBeUndefined();
  });
});
