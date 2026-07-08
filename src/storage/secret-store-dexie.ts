import { withAbort } from "./abort";
import type { SecretStore } from "./contract";
import type { GraphleDB } from "./db";

/** Fixed key under which the GitHub personal access token is stored. */
const GITHUB_PAT_KEY = "github-pat";

/**
 * Create a SecretStore backed by the given Dexie database. The GitHub PAT is
 * the sole value in the secrets table addressed by a fixed key; get returns
 * undefined when no token has been set. set is idempotent (put overwrites).
 */
export function createSecretStore(db: GraphleDB): SecretStore {
  return {
    getGitHubToken(signal) {
      return withAbort(signal, async () => {
        const record = await db.secrets.get(GITHUB_PAT_KEY);
        if (record === undefined) return undefined;
        return record.value;
      });
    },

    setGitHubToken(token, signal) {
      return withAbort(signal, async () => {
        await db.secrets.put({ key: GITHUB_PAT_KEY, value: token });
      });
    },

    clearGitHubToken(signal) {
      return withAbort(signal, async () => {
        await db.secrets.delete(GITHUB_PAT_KEY);
      });
    },
  };
}
