import { z } from "zod";

import { GraphDocumentSchema } from "./graph";
import { IsoTimestamp } from "./primitives";

/**
 * A point-in-time checkpoint of a graph document. `origin` records
 * provenance: 'local' for an ordinary auto-saved checkpoint,
 * 'remote-pull' for one fetched from a linked gist, and 'remote-restore'
 * for one created when a sync conflict was resolved by discarding local
 * changes in favour of remote. A `label` turns a revision into a named
 * tag; there is no separate tags table, a tag is just a labelled revision.
 */
export const GraphRevision = z.object({
  id: z.string(),
  graphId: z.string(),
  document: GraphDocumentSchema,
  createdAt: IsoTimestamp,
  origin: z.enum(["local", "remote-pull", "remote-restore"]).default("local"),
  label: z.string().optional(),
});
export type GraphRevision = z.infer<typeof GraphRevision>;
