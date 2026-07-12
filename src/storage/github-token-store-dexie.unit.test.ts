import { beforeEach, describe, expect, it } from "vitest";

import type { StoredGithubToken } from "../schema";
import { GraphleDB } from "./db";
import { createGithubTokenStore } from "./github-token-store-dexie";

/** A fresh, never-aborted signal for operations that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

function makeToken({
  id = crypto.randomUUID(),
  label = "Test token",
  tokenType = "classic",
  token = "ghp_secret123",
  scope = { kind: "any" },
  createdAt = "2024-01-15T10:30:00Z",
  lastUsedAt,
}: Partial<StoredGithubToken> = {}): StoredGithubToken {
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

describe("createGithubTokenStore", () => {
  let db: GraphleDB;

  beforeEach(async () => {
    db = new GraphleDB();
    await db.githubTokens.clear();
  });

  it("returns an empty list when no tokens are stored", async () => {
    const store = createGithubTokenStore(db);
    expect(await store.list(freshSignal())).toEqual([]);
  });

  it("round-trips a token through save and list", async () => {
    const store = createGithubTokenStore(db);
    const token = makeToken();
    await store.save(token, freshSignal());
    expect(await store.list(freshSignal())).toEqual([token]);
  });

  it("gets a single token by id, returning undefined when absent", async () => {
    const store = createGithubTokenStore(db);
    const token = makeToken();
    await store.save(token, freshSignal());
    expect(await store.get(token.id, freshSignal())).toEqual(token);
    expect(await store.get("missing", freshSignal())).toBeUndefined();
  });

  it("removes a stored token", async () => {
    const store = createGithubTokenStore(db);
    const token = makeToken();
    await store.save(token, freshSignal());
    await store.remove(token.id, freshSignal());
    expect(await store.get(token.id, freshSignal())).toBeUndefined();
  });

  it("keeps multiple tokens independently addressable", async () => {
    const store = createGithubTokenStore(db);
    const first = makeToken({ id: "a", label: "First" });
    const second = makeToken({ id: "b", label: "Second", scope: { kind: "owner", owners: ["ExaDev"] } });
    await store.save(first, freshSignal());
    await store.save(second, freshSignal());
    const list = await store.list(freshSignal());
    expect(list).toHaveLength(2);
    expect(await store.get("a", freshSignal())).toEqual(first);
    expect(await store.get("b", freshSignal())).toEqual(second);
  });

  it("touchLastUsed stamps lastUsedAt on an existing token", async () => {
    const store = createGithubTokenStore(db);
    const token = makeToken();
    await store.save(token, freshSignal());
    await store.touchLastUsed(token.id, freshSignal());
    const updated = await store.get(token.id, freshSignal());
    expect(updated?.lastUsedAt).toBeDefined();
  });

  it("touchLastUsed resolves silently for an id that does not exist", async () => {
    const store = createGithubTokenStore(db);
    await expect(store.touchLastUsed("missing", freshSignal())).resolves.toBeUndefined();
  });
});
