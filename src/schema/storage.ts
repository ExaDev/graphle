import { z } from "zod";

import { GraphDocument } from "./graph";
import { IsoTimestamp } from "./primitives";

/** A complete graph document persisted in IndexedDB, keyed by `id`. */
export const StoredGraph = z.object({
  id: z.string(),
  name: z.string(),
  document: GraphDocument,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
});
export type StoredGraph = z.infer<typeof StoredGraph>;

/** Lightweight projection of a stored graph for list views. */
export const StoredGraphSummary = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: IsoTimestamp,
});
export type StoredGraphSummary = z.infer<typeof StoredGraphSummary>;
