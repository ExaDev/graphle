/**
 * Loads `.env` (repo root) into `process.env` for local integration/e2e test
 * runs, if the file exists. A no-op when it's absent — the normal state in
 * CI, which supplies `GITHUB_TEST_PAT` as a real environment variable
 * instead, and for any developer who hasn't set up local testing yet.
 *
 * Node-only: never imported from `src/ui`/`src/github`/etc, so a real token
 * in `.env` never reaches the client bundle. See `.env.example` for the
 * variable this unlocks.
 */
import { existsSync } from "node:fs";

const envPath = new URL("../../.env", import.meta.url);
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
