import { z } from "zod";

import { GraphDocumentSchema } from "./graph";
import { IsoTimestamp } from "./primitives";
import { LinkedRemoteSource } from "./remote-source";

/** A complete graph document persisted in IndexedDB, keyed by `id`. */
export const StoredGraph = z.object({
  id: z.string(),
  name: z.string(),
  document: GraphDocumentSchema,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  // Link/sync bookkeeping belongs to the local save, not the shareable document.
  linkedRemote: LinkedRemoteSource.optional(),
});
export type StoredGraph = z.infer<typeof StoredGraph>;

/** Lightweight projection of a stored graph for list views. */
export const StoredGraphSummary = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: IsoTimestamp,
});
export type StoredGraphSummary = z.infer<typeof StoredGraphSummary>;
