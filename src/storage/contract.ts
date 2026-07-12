import type {
  GraphRevision,
  StoredGithubToken,
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
 * Read/write contract for stored GitHub personal access tokens. Several
 * tokens may coexist (classic and fine-grained, scoped to different
 * owners), so unlike the old single-secret contract this is addressed by
 * generated ids rather than a fixed key.
 */
export interface GithubTokenStore {
  list(signal: AbortSignal): Promise<StoredGithubToken[]>;
  get(id: string, signal: AbortSignal): Promise<StoredGithubToken | undefined>;
  save(token: StoredGithubToken, signal: AbortSignal): Promise<void>;
  remove(id: string, signal: AbortSignal): Promise<void>;
  touchLastUsed(id: string, signal: AbortSignal): Promise<void>;
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
