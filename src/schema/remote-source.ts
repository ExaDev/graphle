import { z } from "zod";

import { IsoTimestamp } from "./primitives";

/**
 * A graph's link to a remote source it can sync with. `syncMode: "off"`
 * retains the link for provenance/history display without ever reading or
 * writing automatically; `"manual"` and `"automatic"` are implemented by
 * `useGistAutoSync`/`useGithubFileAutoSync` (automatic) and
 * `GraphsDrawer`'s Push/Pull actions (manual), one pair of implementations
 * per provider arm below.
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
