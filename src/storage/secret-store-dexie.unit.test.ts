import { beforeEach, describe, expect, it } from "vitest";

import { GraphleDB } from "./db";
import { createSecretStore } from "./secret-store-dexie";

/** A fresh, never-aborted signal for operations that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

describe("createSecretStore", () => {
  let db: GraphleDB;

  beforeEach(async () => {
    db = new GraphleDB();
    await Promise.all([db.graphs.clear(), db.secrets.clear()]);
  });

  it("returns undefined when no GitHub token is set", async () => {
    const store = createSecretStore(db);
    expect(await store.getGitHubToken(freshSignal())).toBeUndefined();
  });

  it("round-trips a GitHub token through set and get", async () => {
    const store = createSecretStore(db);
    await store.setGitHubToken("ghp_secret123", freshSignal());
    expect(await store.getGitHubToken(freshSignal())).toBe("ghp_secret123");
  });

  it("overwrites the previous token on set", async () => {
    const store = createSecretStore(db);
    await store.setGitHubToken("ghp_first", freshSignal());
    await store.setGitHubToken("ghp_second", freshSignal());
    expect(await store.getGitHubToken(freshSignal())).toBe("ghp_second");
  });

  it("clears a set GitHub token", async () => {
    const store = createSecretStore(db);
    await store.setGitHubToken("ghp_secret123", freshSignal());
    await store.clearGitHubToken(freshSignal());
    expect(await store.getGitHubToken(freshSignal())).toBeUndefined();
  });
});
