import type {
  GraphRevision,
  StoredGraph,
  StoredGraphSummary,
  StoredTypeLibrary,
} from "../schema";

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

/**
 * Read/write contract for graph revision history. Revisions are recorded
 * snapshots of a graph over time; tagging marks one as significant so pruning
 * leaves it alone. Ordering and retention policy are adapter concerns, not
 * part of this contract.
 */
export interface RevisionStore {
  list(graphId: string, signal: AbortSignal): Promise<GraphRevision[]>;
  get(id: string, signal: AbortSignal): Promise<GraphRevision | undefined>;
  record(revision: GraphRevision, signal: AbortSignal): Promise<void>;
  tag(id: string, label: string, signal: AbortSignal): Promise<void>;
  untag(id: string, signal: AbortSignal): Promise<void>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  prune(graphId: string, signal: AbortSignal): Promise<void>;
}

/**
 * Read/write contract for the user's personal type library: a singleton
 * document, so unlike GraphStore there is no id parameter or list/remove -
 * there is exactly one row to get and save.
 */
export interface TypeLibraryStore {
  get(signal: AbortSignal): Promise<StoredTypeLibrary | undefined>;
  save(library: StoredTypeLibrary, signal: AbortSignal): Promise<void>;
}
