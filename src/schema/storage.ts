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

/** Fine-grained tokens are hard-limited by GitHub to a single resource
 *  owner; classic tokens carry no such restriction — `scope` is a
 *  graphle-side routing preference for classic tokens, not a
 *  GitHub-enforced boundary. */
export const GithubTokenType = z.enum(["classic", "fine-grained"]);
export type GithubTokenType = z.infer<typeof GithubTokenType>;

/** `"any"` is the fallback tier every resolution falls through to;
 *  `"owner"` pins a token to one or more logins/orgs, checked first. */
export const GithubTokenScope = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("any") }),
  z.object({ kind: z.literal("owner"), owners: z.array(z.string().min(1)).min(1) }),
]);
export type GithubTokenScope = z.infer<typeof GithubTokenScope>;

/**
 * A stored GitHub personal access token. `id` is a generated uuid, not a
 * fixed key, since several of these coexist. A fine-grained token is
 * restricted by GitHub to exactly one resource owner, so `scope.owners`
 * must have length 1 when `tokenType` is `"fine-grained"`.
 */
export const StoredGithubToken = z
  .object({
    id: z.string(),
    label: z.string().min(1),
    tokenType: GithubTokenType,
    token: z.string().min(1),
    scope: GithubTokenScope,
    createdAt: IsoTimestamp,
    lastUsedAt: IsoTimestamp.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.tokenType === "fine-grained" && value.scope.kind === "owner" && value.scope.owners.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message: "a fine-grained token can only be scoped to exactly one owner",
        path: ["scope", "owners"],
      });
    }
  });
export type StoredGithubToken = z.infer<typeof StoredGithubToken>;
