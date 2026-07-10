import { z } from "zod";

import { GraphDocumentSchema } from "./graph";
import { IsoTimestamp } from "./primitives";
import { LinkedRemoteSource } from "./remote-source";
import { TypeLibraryDocument } from "./type-library";

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

/**
 * The user's one personal type library, persisted the same way a per-graph
 * {@link StoredGraph} is, but as a singleton row: `id` is always the literal
 * string "library" rather than a generated id, so exactly one row ever exists.
 */
export const StoredTypeLibrary = z.object({
  id: z.literal("library"),
  document: TypeLibraryDocument,
  // Link/sync bookkeeping belongs to the local save, not the shareable document.
  linkedRemote: LinkedRemoteSource.optional(),
  updatedAt: IsoTimestamp,
});
export type StoredTypeLibrary = z.infer<typeof StoredTypeLibrary>;
