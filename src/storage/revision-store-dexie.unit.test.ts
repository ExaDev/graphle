import { beforeEach, describe, expect, it } from "vitest";

import { GRAPH_DOCUMENT_VERSION, type GraphDocument, type GraphRevision } from "../schema";
import { AbortError } from "./abort";
import { GraphleDB } from "./db";
import { createRevisionStore } from "./revision-store-dexie";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A fresh, never-aborted signal for operations that should run to completion. */
function freshSignal(): AbortSignal {
  return new AbortController().signal;
}

const document: GraphDocument = {
  version: GRAPH_DOCUMENT_VERSION,
  name: "Test graph",
  types: [],
  edgeTypes: [],
  nodes: [],
  edges: [],
};

/** Build a valid GraphRevision, overriding selected fields. Destructure
 *  defaults (rather than spreading a Partial) so the result is always a
 *  complete GraphRevision under exactOptionalPropertyTypes. */
function makeRevision({
  id = crypto.randomUUID(),
  graphId = "graph-1",
  createdAt = new Date().toISOString(),
  origin = "local",
  label,
}: {
  id?: string;
  graphId?: string;
  createdAt?: string;
  origin?: GraphRevision["origin"];
  label?: string;
} = {}): GraphRevision {
  if (label === undefined) return { id, graphId, document, createdAt, origin };
  return { id, graphId, document, createdAt, origin, label };
}

describe("createRevisionStore", () => {
  let db: GraphleDB;

  beforeEach(async () => {
    // A fresh connection to the shared named database, with all tables
    // cleared, isolates each test from writes by earlier tests.
    db = new GraphleDB();
    await Promise.all([db.graphs.clear(), db.secrets.clear(), db.revisions.clear()]);
  });

  it("records a revision and lists it back", async () => {
    const store = createRevisionStore(db);
    const revision = makeRevision();
    await store.record(revision, freshSignal());

    const revisions = await store.list(revision.graphId, freshSignal());
    expect(revisions).toEqual([revision]);
  });

  it("lists two recorded revisions most-recent-first", async () => {
    const store = createRevisionStore(db);
    const older = makeRevision({ id: "a", createdAt: "2024-01-01T00:00:00Z" });
    const newer = makeRevision({ id: "b", createdAt: "2024-02-01T00:00:00Z" });
    // Record out of order to prove the store sorts, not insertion order.
    await store.record(older, freshSignal());
    await store.record(newer, freshSignal());

    const revisions = await store.list(older.graphId, freshSignal());
    expect(revisions.map((revision) => revision.id)).toEqual(["b", "a"]);
  });

  it("returns undefined when getting an absent id", async () => {
    const store = createRevisionStore(db);
    const loaded = await store.get("does-not-exist", freshSignal());
    expect(loaded).toBeUndefined();
  });

  it("tags and then untags a revision, round-tripping label absence through GraphRevision", async () => {
    const store = createRevisionStore(db);
    const revision = makeRevision();
    await store.record(revision, freshSignal());

    await store.tag(revision.id, "Before refactor", freshSignal());
    const tagged = await store.get(revision.id, freshSignal());
    expect(tagged?.label).toBe("Before refactor");

    await store.untag(revision.id, freshSignal());
    const untagged = await store.get(revision.id, freshSignal());
    expect(untagged?.label).toBeUndefined();

    // Prove the label key is genuinely absent on the stored row, not merely
    // present with value undefined, confirming Table.update()'s callback
    // form (delete revision.label) rather than a { label: undefined } spec.
    const rawRow: unknown = await db.table("revisions").get(revision.id);
    if (typeof rawRow !== "object" || rawRow === null) {
      throw new Error("expected a stored revision row");
    }
    expect("label" in rawRow).toBe(false);
  });

  it("removes a stored revision", async () => {
    const store = createRevisionStore(db);
    const revision = makeRevision();
    await store.record(revision, freshSignal());
    await store.remove(revision.id, freshSignal());
    expect(await store.get(revision.id, freshSignal())).toBeUndefined();
  });

  it("rejects with AbortError when the signal is already aborted", async () => {
    const store = createRevisionStore(db);
    const controller = new AbortController();
    controller.abort();
    await expect(store.list("graph-1", controller.signal)).rejects.toBeInstanceOf(AbortError);
  });

  describe("prune", () => {
    it("keeps the most recent revisions up to the cap and always keeps labelled ones, deleting old untagged excess", async () => {
      const graphId = "prune-graph";
      const now = Date.now();

      // 55 untagged revisions, all older than the 30-day retention window, so
      // only the count-based cap (not the age-based leniency) can save them.
      // r0 is the most recent of the 55 (40 days old), r54 the oldest (94 days).
      const untagged: GraphRevision[] = [];
      for (let index = 0; index < 55; index += 1) {
        const daysAgo = 40 + index;
        untagged.push(
          makeRevision({
            id: `r${index}`,
            graphId,
            createdAt: new Date(now - daysAgo * MS_PER_DAY).toISOString(),
          }),
        );
      }

      // Far older than both the cap and the age window, but labelled, so it
      // must survive pruning regardless.
      const tagged = makeRevision({
        id: "tagged-ancient",
        graphId,
        createdAt: new Date(now - 200 * MS_PER_DAY).toISOString(),
        label: "milestone",
      });

      // Seed rows directly (bypassing record()'s own auto-prune) so prune()
      // is exercised in isolation on a known, fully-formed data set.
      await db.revisions.bulkAdd([...untagged, tagged]);

      const store = createRevisionStore(db);
      await store.prune(graphId, freshSignal());

      const remaining = await store.list(graphId, freshSignal());
      const remainingIds = new Set(remaining.map((revision) => revision.id));

      expect(remainingIds.has("tagged-ancient")).toBe(true);
      for (let index = 0; index < 50; index += 1) {
        expect(remainingIds.has(`r${index}`)).toBe(true);
      }
      for (let index = 50; index < 55; index += 1) {
        expect(remainingIds.has(`r${index}`)).toBe(false);
      }
      expect(remaining).toHaveLength(51);
    });

    it("keeps revisions within the retention window even beyond the count cap", async () => {
      const graphId = "prune-graph-recent";
      const now = Date.now();

      // 55 untagged revisions, all created within the last day, well inside
      // the 30-day window, so the count cap alone must not delete any of them.
      const recent: GraphRevision[] = [];
      for (let index = 0; index < 55; index += 1) {
        recent.push(
          makeRevision({
            id: `s${index}`,
            graphId,
            createdAt: new Date(now - index * 1000).toISOString(),
          }),
        );
      }
      await db.revisions.bulkAdd(recent);

      const store = createRevisionStore(db);
      await store.prune(graphId, freshSignal());

      const remaining = await store.list(graphId, freshSignal());
      expect(remaining).toHaveLength(55);
    });
  });
});
