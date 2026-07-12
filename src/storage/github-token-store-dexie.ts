import { StoredGithubToken } from "../schema";
import { withAbort } from "./abort";
import type { GithubTokenStore } from "./contract";
import type { GraphleDB } from "./db";

/**
 * Create a GithubTokenStore backed by the given Dexie database. Every row
 * read from IndexedDB is re-parsed through the Zod schema before it is
 * returned, matching every other Dexie adapter in this module. `touchLastUsed`
 * resolves silently if the id no longer exists — a resolve-then-touch race
 * against a deletion shouldn't surface as an error to a caller that already
 * has its client.
 */
export function createGithubTokenStore(db: GraphleDB): GithubTokenStore {
  return {
    list(signal) {
      return withAbort(signal, async () => {
        const rows = await db.githubTokens.toArray();
        return rows.map((row) => StoredGithubToken.parse(row));
      });
    },

    get(id, signal) {
      return withAbort(signal, async () => {
        const row = await db.githubTokens.get(id);
        if (row === undefined) return undefined;
        return StoredGithubToken.parse(row);
      });
    },

    save(token, signal) {
      return withAbort(signal, async () => {
        const validated = StoredGithubToken.parse(token);
        await db.githubTokens.put(validated);
      });
    },

    remove(id, signal) {
      return withAbort(signal, async () => {
        await db.githubTokens.delete(id);
      });
    },

    touchLastUsed(id, signal) {
      return withAbort(signal, async () => {
        await db.githubTokens.update(id, { lastUsedAt: new Date().toISOString() });
      });
    },
  };
}
