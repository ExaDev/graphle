import type { StoredGraph, StoredGraphSummary } from "../schema";

/**
 * Read/write contract for persisted graphs. Every method carries an
 * AbortSignal so callers can cancel an in-flight operation; implementations
 * reject promptly when the signal aborts.
 */
export interface GraphStore {
  list(signal: AbortSignal): Promise<StoredGraphSummary[]>;
  get(id: string, signal: AbortSignal): Promise<StoredGraph | undefined>;
  save(graph: StoredGraph, signal: AbortSignal): Promise<void>;
  remove(id: string, signal: AbortSignal): Promise<void>;
}

/**
 * Read/write contract for sensitive singletons (the GitHub PAT). Stored
 * separately from graph data and addressed by fixed keys rather than ids.
 */
export interface SecretStore {
  getGitHubToken(signal: AbortSignal): Promise<string | undefined>;
  setGitHubToken(token: string, signal: AbortSignal): Promise<void>;
  clearGitHubToken(signal: AbortSignal): Promise<void>;
}
