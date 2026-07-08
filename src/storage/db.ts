import Dexie, { type Table } from "dexie";

import type { StoredGraph } from "../schema";

/** A single key/value entry in the secrets table. */
export interface SecretRecord {
  key: string;
  value: string;
}

/**
 * IndexedDB database for Graphle. `graphs` holds whole StoredGraph documents
 * keyed by id, indexed on id, name and updatedAt (the latter two let list()
 * sort by updatedAt via Dexie's orderBy, though it still materialises each
 * document body to do so). `secrets` is a flat key/value store for sensitive
 * tokens (the GitHub PAT) kept apart from graph data.
 */
export class GraphleDB extends Dexie {
  graphs!: Table<StoredGraph, string>;
  secrets!: Table<SecretRecord, string>;

  constructor() {
    super("graphle");
    this.version(1).stores({
      graphs: "id, name, updatedAt",
      secrets: "key",
    });
  }
}

/** Process-wide singleton. Tests construct their own instances for isolation. */
export const db = new GraphleDB();
