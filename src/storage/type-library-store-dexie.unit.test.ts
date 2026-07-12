import { beforeEach, describe, expect, it } from "vitest";

import type { StoredTypeLibrary } from "../schema";
import { GraphleDB } from "./db";
import { createTypeLibraryStore } from "./type-library-store-dexie";

/** A fresh, never-aborted signal for operations that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Build a valid StoredTypeLibrary, overriding selected fields. */
function makeLibrary({
  updatedAt = "2024-01-01T00:00:00.000Z",
}: {
  updatedAt?: string;
} = {}): StoredTypeLibrary {
  return {
    id: "library",
    document: { version: 1, nodeTypes: [], edgeTypes: [] },
    updatedAt,
  };
}

describe("createTypeLibraryStore", () => {
  let db: GraphleDB;

  beforeEach(async () => {
    // A fresh connection to the shared named database, with all tables
    // cleared, isolates each test from writes by earlier tests.
    db = new GraphleDB();
    await Promise.all([
      db.graphs.clear(),
      db.revisions.clear(),
      db.typeLibrary.clear(),
    ]);
  });

  it("saves a type library and reads it back", async () => {
    const store = createTypeLibraryStore(db);
    const library = makeLibrary();
    await store.save(library, freshSignal());

    expect(await store.get(freshSignal())).toEqual(library);
  });

  it("returns undefined when no type library has been saved", async () => {
    const store = createTypeLibraryStore(db);
    expect(await store.get(freshSignal())).toBeUndefined();
  });

  it("overwrites the previous library on a second save", async () => {
    const store = createTypeLibraryStore(db);
    const first = makeLibrary({ updatedAt: "2024-01-01T00:00:00.000Z" });
    const second = makeLibrary({ updatedAt: "2024-02-01T00:00:00.000Z" });

    await store.save(first, freshSignal());
    await store.save(second, freshSignal());

    expect(await store.get(freshSignal())).toEqual(second);
  });
});
