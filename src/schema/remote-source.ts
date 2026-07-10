import { z } from "zod";

import { IsoTimestamp } from "./primitives";

/**
 * A graph's link to a remote source it can sync with. `syncMode: "off"`
 * retains the link for provenance/history display without ever reading or
 * writing automatically; `"manual"` and `"automatic"` are implemented by
 * later-phase sync code.
 *
 * The `githubFile` provider is reserved but not wired up anywhere else yet,
 * so its shape exists purely to make adding it later additive rather than
 * a breaking schema change.
 */
export const LinkedRemoteSource = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("gist"),
    gistId: z.string(),
    filename: z.string(),
    syncMode: z.enum(["off", "manual", "automatic"]),
    lastSyncedRevision: z.string().optional(),
    lastSyncedAt: IsoTimestamp.optional(),
  }),
  z.object({
    provider: z.literal("githubFile"),
    owner: z.string(),
    repo: z.string(),
    branch: z.string(),
    path: z.string(),
    syncMode: z.enum(["off", "manual", "automatic"]),
    lastSyncedRevision: z.string().optional(),
    lastSyncedAt: IsoTimestamp.optional(),
  }),
]);
export type LinkedRemoteSource = z.infer<typeof LinkedRemoteSource>;
