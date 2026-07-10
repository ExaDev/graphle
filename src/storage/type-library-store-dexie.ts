import { StoredTypeLibrary } from "../schema";
import { withAbort } from "./abort";
import type { TypeLibraryStore } from "./contract";
import type { GraphleDB } from "./db";

/** Fixed key under which the singleton type library row is stored. */
const TYPE_LIBRARY_KEY = "library";

/**
 * Create a TypeLibraryStore backed by the given Dexie database. The type
 * library is the sole row in the typeLibrary table, addressed by the fixed
 * key "library"; get returns undefined when no library has been saved yet.
 * save validates before writing, mirroring the graph and revision stores'
 * read/write-side validation, then upserts via put.
 */
export function createTypeLibraryStore(db: GraphleDB): TypeLibraryStore {
  return {
    get(signal) {
      return withAbort(signal, async () => {
        const row = await db.typeLibrary.get(TYPE_LIBRARY_KEY);
        if (row === undefined) return undefined;
        return StoredTypeLibrary.parse(row);
      });
    },

    save(library, signal) {
      return withAbort(signal, async () => {
        const validated = StoredTypeLibrary.parse(library);
        await db.typeLibrary.put(validated);
      });
    },
  };
}
