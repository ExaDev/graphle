import { StoredGraph, StoredGraphSummary } from "../schema";
import { withAbort } from "./abort";
import type { GraphStore } from "./contract";
import type { GraphleDB } from "./db";

/**
 * Create a GraphStore backed by the given Dexie database. Every row read from
 * IndexedDB is re-parsed through the Zod schema before it is returned, so a
 * StoredGraph corrupted on disk (or written by a future, incompatible schema
 * version) surfaces as a parse failure rather than flowing into the domain
 * layer as unvalidated data. A genuinely absent row returns undefined; a row
 * that is present but fails validation throws, so corruption is not silently
 * conflated with absence. `list` returns summaries sorted by updatedAt
 * descending, ordered on the index. `save` validates the incoming graph
 * before writing so only schema-conforming documents ever reach the store.
 */
export function createGraphStore(db: GraphleDB): GraphStore {
  return {
    list(signal) {
      return withAbort(signal, async () => {
        const rows = await db.graphs.orderBy("updatedAt").reverse().toArray();
        return rows.map((row) => StoredGraphSummary.parse(row));
      });
    },

    get(id, signal) {
      return withAbort(signal, async () => {
        const row = await db.graphs.get(id);
        if (row === undefined) return undefined;
        return StoredGraph.parse(row);
      });
    },

    save(graph, signal) {
      return withAbort(signal, async () => {
        const validated = StoredGraph.parse(graph);
        await db.graphs.put(validated);
      });
    },

    remove(id, signal) {
      return withAbort(signal, async () => {
        await db.graphs.delete(id);
      });
    },
  };
}
