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
    // Which stored GitHub token last synced this link successfully — pins
    // resolution to the same identity on later syncs rather than drifting
    // to whatever token was most recently used elsewhere.
    lastUsedTokenId: z.string().optional(),
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
    lastUsedTokenId: z.string().optional(),
  }),
]);
export type LinkedRemoteSource = z.infer<typeof LinkedRemoteSource>;
