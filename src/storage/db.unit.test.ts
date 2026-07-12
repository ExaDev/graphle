import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GraphleDB } from "./db";

const DB_NAME = "graphle";

async function deleteDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => {
      const { error } = request;
      reject(error instanceof Error ? error : new Error("failed to delete database"));
    };
    request.onblocked = () => resolve();
  });
}

/** Recreates the pre-migration (version 3) schema under a raw Dexie
 *  instance, mirroring GraphleDB's own versions 1-3 exactly, so the
 *  version(4) migration can be exercised against a real on-disk v3
 *  database rather than only tested against its post-migration shape. */
function openLegacyV3Database(): Dexie {
  const legacy = new Dexie(DB_NAME);
  legacy.version(1).stores({ graphs: "id, name, updatedAt", secrets: "key" });
  legacy.version(2).stores({
    graphs: "id, name, updatedAt",
    secrets: "key",
    revisions: "id, graphId, createdAt, [graphId+createdAt]",
  });
  legacy.version(3).stores({
    graphs: "id, name, updatedAt",
    secrets: "key",
    revisions: "id, graphId, createdAt, [graphId+createdAt]",
    typeLibrary: "id",
  });
  return legacy;
}

describe("GraphleDB version 4 migration", () => {
  beforeEach(async () => {
    await deleteDatabase();
  });

  afterEach(async () => {
    await deleteDatabase();
  });

  it("migrates a legacy github-pat secret into githubTokens and drops the secrets table", async () => {
    const legacy = openLegacyV3Database();
    await legacy.open();
    await legacy.table("secrets").put({ key: "github-pat", value: "ghp_legacy123" });
    legacy.close();

    const upgraded = new GraphleDB();
    await upgraded.open();

    const tokens = await upgraded.githubTokens.toArray();
    expect(tokens).toHaveLength(1);
    const migrated = tokens[0];
    if (migrated === undefined) throw new Error("expected a migrated token");
    expect(migrated.token).toBe("ghp_legacy123");
    expect(migrated.tokenType).toBe("classic");
    expect(migrated.scope).toEqual({ kind: "any" });
    expect(migrated.label).toBe("Imported token");

    expect(upgraded.tables.some((table) => table.name === "secrets")).toBe(false);

    upgraded.close();
  });

  it("does nothing when no legacy secret exists", async () => {
    const legacy = openLegacyV3Database();
    await legacy.open();
    legacy.close();

    const upgraded = new GraphleDB();
    await upgraded.open();

    expect(await upgraded.githubTokens.toArray()).toHaveLength(0);
    upgraded.close();
  });
});
