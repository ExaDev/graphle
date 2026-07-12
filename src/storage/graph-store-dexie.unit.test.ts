import { beforeEach, describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument, type StoredGraph } from "../schema";
import { AbortError } from "./abort";
import { GraphleDB } from "./db";
import { createGraphStore } from "./graph-store-dexie";

/** A fresh, never-aborted signal for operations that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

/** Build a valid StoredGraph, overriding selected fields. Destructure
 *  defaults (rather than spreading a Partial) so the result is always a
 *  complete StoredGraph under exactOptionalPropertyTypes. */
function makeGraph({
  id = crypto.randomUUID(),
  name = "Test graph",
  updatedAt = "2024-01-15T10:30:00Z",
  document = {
    version: GRAPH_DOCUMENT_VERSION,
    name,
    types: [],
    edgeTypes: [],
    nodes: [],
    edges: [],
  },
  createdAt = updatedAt,
}: {
  id?: string;
  name?: string;
  updatedAt?: string;
  createdAt?: string;
  document?: GraphDocument;
} = {}): StoredGraph {
  return { id, name, document, createdAt, updatedAt };
}

describe("createGraphStore", () => {
  let db: GraphleDB;

  beforeEach(async () => {
    // A fresh connection to the shared named database, with all tables
    // cleared, isolates each test from writes by earlier tests.
    db = new GraphleDB();
    await db.graphs.clear();
  });

  it("round-trips a graph through save and get", async () => {
    const store = createGraphStore(db);
    const graph = makeGraph();
    await store.save(graph, freshSignal());
    const loaded = await store.get(graph.id, freshSignal());
    expect(loaded).toEqual(graph);
  });

  it("returns undefined when getting an absent id", async () => {
    const store = createGraphStore(db);
    const loaded = await store.get("does-not-exist", freshSignal());
    expect(loaded).toBeUndefined();
  });

  it("rejects a hand-corrupted row via StoredGraph.parse", async () => {
    // Bypass the store's own validation to seed a row whose document.version
    // is from an incompatible future schema. db.table() returns an untyped
    // handle, the correct escape hatch for deliberately corrupt data.
    const corruptRow = {
      id: "corrupt-1",
      name: "Corrupt",
      document: { version: 2, name: "Corrupt", nodes: [], edges: [] },
      createdAt: "2024-01-15T10:30:00Z",
      updatedAt: "2024-01-15T10:30:00Z",
    };
    await db.table("graphs").put(corruptRow);

    const store = createGraphStore(db);
    await expect(store.get("corrupt-1", freshSignal())).rejects.toThrow();
  });

  it("lists summaries sorted by updatedAt descending", async () => {
    const store = createGraphStore(db);
    const january = makeGraph({ id: "a", updatedAt: "2024-01-01T00:00:00Z" });
    const march = makeGraph({ id: "b", updatedAt: "2024-03-01T00:00:00Z" });
    const february = makeGraph({ id: "c", updatedAt: "2024-02-01T00:00:00Z" });
    // Insert out of order to prove the store sorts, not insertion order.
    await store.save(january, freshSignal());
    await store.save(march, freshSignal());
    await store.save(february, freshSignal());

    const summaries = await store.list(freshSignal());
    expect(summaries.map((summary) => summary.id)).toEqual(["b", "c", "a"]);
  });

  it("removes a stored graph", async () => {
    const store = createGraphStore(db);
    const graph = makeGraph();
    await store.save(graph, freshSignal());
    await store.remove(graph.id, freshSignal());
    expect(await store.get(graph.id, freshSignal())).toBeUndefined();
  });

  it("rejects with AbortError when the signal is already aborted", async () => {
    const store = createGraphStore(db);
    const controller = new AbortController();
    controller.abort();
    await expect(store.list(controller.signal)).rejects.toBeInstanceOf(AbortError);
  });
});
