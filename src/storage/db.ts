import Dexie, { type Table } from "dexie";

import type { GraphRevision, StoredGithubToken, StoredGraph, StoredTypeLibrary } from "../schema";

/** A single key/value entry in the legacy secrets table, retired in version 4. */
export interface SecretRecord {
  key: string;
  value: string;
}

/** Fixed key the legacy single-token secrets table stored the GitHub PAT under. */
const LEGACY_GITHUB_PAT_KEY = "github-pat";

/**
 * IndexedDB database for Graphle. `graphs` holds whole StoredGraph documents
 * keyed by id, indexed on id, name and updatedAt (the latter two let list()
 * sort by updatedAt via Dexie's orderBy, though it still materialises each
 * document body to do so). `revisions` holds point-in-time snapshots of a
 * graph, indexed by id and by the compound `[graphId+createdAt]` key so
 * callers can page through a graph's history in order without a full table
 * scan. `typeLibrary` is a singleton table - always exactly one row, keyed
 * by the literal string "library" - holding the user's personal node/edge
 * type library. `githubTokens` holds any number of stored GitHub personal
 * access tokens, indexed on id and label.
 */
export class GraphleDB extends Dexie {
  graphs!: Table<StoredGraph, string>;
  revisions!: Table<GraphRevision, string>;
  typeLibrary!: Table<StoredTypeLibrary, string>;
  githubTokens!: Table<StoredGithubToken, string>;

  constructor() {
    super("graphle");
    this.version(1).stores({
      graphs: "id, name, updatedAt",
      secrets: "key",
    });
    // Additive table/index only, so Dexie applies it without an upgrade callback.
    this.version(2).stores({
      graphs: "id, name, updatedAt",
      secrets: "key",
      revisions: "id, graphId, createdAt, [graphId+createdAt]",
    });
    // Additive table only, so Dexie applies it without an upgrade callback.
    this.version(3).stores({
      graphs: "id, name, updatedAt",
      secrets: "key",
      revisions: "id, graphId, createdAt, [graphId+createdAt]",
      typeLibrary: "id",
    });
    // Retires the single-token `secrets` key/value table in favour of
    // `githubTokens`, which holds any number of tokens. Unlike versions 1-3
    // this is NOT additive: `secrets: null` drops the old table, and the
    // upgrade callback moves its one possible row across first — Dexie's
    // upgrade transaction has access to both the outgoing and incoming
    // table for exactly this kind of move. The migrated token is guessed
    // as classic/any-scoped (there's no reliable way to tell a token's real
    // type/scope from its string alone); the user can correct the label,
    // type and scope from the token panel's Edit action after upgrading.
    this.version(4)
      .stores({
        graphs: "id, name, updatedAt",
        secrets: null,
        revisions: "id, graphId, createdAt, [graphId+createdAt]",
        typeLibrary: "id",
        githubTokens: "id, label",
      })
      .upgrade(async (tx) => {
        const record = await tx.table<SecretRecord, string>("secrets").get(LEGACY_GITHUB_PAT_KEY);
        if (record === undefined) return;
        await tx.table<StoredGithubToken, string>("githubTokens").add({
          id: crypto.randomUUID(),
          label: "Imported token",
          tokenType: "classic",
          token: record.value,
          scope: { kind: "any" },
          createdAt: new Date().toISOString(),
        });
      });
  }
}

/** Process-wide singleton. Tests construct their own instances for isolation. */
export const db = new GraphleDB();
