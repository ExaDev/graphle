import Dexie from "dexie";

import { GraphRevision } from "../schema";
import { withAbort } from "./abort";
import type { RevisionStore } from "./contract";
import type { GraphleDB } from "./db";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Retention policy applied by prune(): a revision survives if it falls
 * within the most recent `maxCount` revisions for its graph, or within the
 * last `maxAgeDays`, whichever is more permissive. A labelled revision is
 * exempt from both limits.
 */
const REVISION_RETENTION = { maxCount: 50, maxAgeDays: 30 } as const;

/**
 * Rows for a graph, most-recent-first, read via the `[graphId+createdAt]`
 * compound index so ordering comes from the index rather than an in-memory
 * sort. Shared by list() (which re-validates each row) and prune() (which
 * only needs id/createdAt/label and so reads the raw rows directly).
 */
function readRevisionsDescending(db: GraphleDB, graphId: string): Promise<GraphRevision[]> {
  return db.revisions
    .where("[graphId+createdAt]")
    .between([graphId, Dexie.minKey], [graphId, Dexie.maxKey])
    .reverse()
    .toArray();
}

/**
 * Create a RevisionStore backed by the given Dexie database. Every row read
 * from IndexedDB is re-parsed through GraphRevision before it is returned,
 * mirroring the graph store's read-side validation. record() enforces
 * retention opportunistically by pruning the written graph's history after
 * every write, rather than requiring a separate scheduled sweep.
 *
 * untag() uses the callback form of Table.update() and deletes the `label`
 * property from the fetched object, rather than passing `{ label: undefined
 * }` as an UpdateSpec. Dexie's UpdateSpec type is built from `Required<T>`,
 * so an explicit `undefined` there does not typecheck under this project's
 * `exactOptionalPropertyTypes`; deleting the key is also the correct
 * runtime behaviour, leaving the row with `label` genuinely absent rather
 * than present-but-undefined, which is what GraphRevision's `label:
 * z.string().optional()` expects on the next read.
 */
export function createRevisionStore(db: GraphleDB): RevisionStore {
  const revisionStore: RevisionStore = {
    list(graphId, signal) {
      return withAbort(signal, async () => {
        const rows = await readRevisionsDescending(db, graphId);
        return rows.map((row) => GraphRevision.parse(row));
      });
    },

    get(id, signal) {
      return withAbort(signal, async () => {
        const row = await db.revisions.get(id);
        if (row === undefined) return undefined;
        return GraphRevision.parse(row);
      });
    },

    record(revision, signal) {
      return withAbort(signal, async () => {
        const validated = GraphRevision.parse(revision);
        await db.revisions.put(validated);
      }).then(() => revisionStore.prune(revision.graphId, signal));
    },

    tag(id, label, signal) {
      return withAbort(signal, async () => {
        await db.revisions.update(id, { label });
      });
    },

    untag(id, signal) {
      return withAbort(signal, async () => {
        await db.revisions.update(id, (revision) => {
          delete revision.label;
        });
      });
    },

    remove(id, signal) {
      return withAbort(signal, async () => {
        await db.revisions.delete(id);
      });
    },

    prune(graphId, signal) {
      return withAbort(signal, async () => {
        const rows = await readRevisionsDescending(db, graphId);
        const cutoff = Date.now() - REVISION_RETENTION.maxAgeDays * MS_PER_DAY;
        const idsToDelete = rows
          .filter((row, index) => {
            if (row.label !== undefined) return false;
            if (index < REVISION_RETENTION.maxCount) return false;
            return new Date(row.createdAt).getTime() < cutoff;
          })
          .map((row) => row.id);
        if (idsToDelete.length > 0) await db.revisions.bulkDelete(idsToDelete);
      });
    },
  };

  return revisionStore;
}
