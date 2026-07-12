import { z } from "zod";

/**
 * Zod schemas for the GitHub GraphQL entity shapes the client materialises, and
 * for the per-query response envelopes the adapter parses. Each entity schema is
 * the single source of truth: the inferred type is exported alongside it and
 * the rest of the client derives its types from these definitions.
 */

/**
 * A nullable GraphQL string scalar, transformed to `undefined` once at the
 * parse boundary so the rest of the app can keep its "absence is
 * `undefined`, never `null`" convention. GraphQL returns an explicit `null`
 * for a selected-but-unset nullable field — it does not omit the key — so a
 * bare `z.string().optional()` (which only accepts `undefined`) fails to
 * parse the instant a real node has one, e.g. `User.name`/`Repository.description`
 * for the (very common) case of no display name/description set. Confirmed
 * via schema introspection and a live search API response, since this is
 * exactly the class of bug — a hand-assumed wire shape nothing had checked
 * against a real response — that has bitten this file more than once
 * already (see `GitHubIssueState`'s doc comment for the sibling casing bug).
 */
function nullableString() {
  return z
    .string()
    .nullable()
    .transform((value) => value ?? undefined);
}

/** The authenticated user — the root of every `viewer { ... }` query. */
export const GitHubViewer = z.object({ login: z.string() });
export type GitHubViewer = z.infer<typeof GitHubViewer>;

/** A GitHub organisation (or user account treated as an org). */
export const GitHubOrg = z.object({
  login: z.string(),
  name: nullableString(),
  url: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type GitHubOrg = z.infer<typeof GitHubOrg>;

/** A GitHub repository. The owner is nested per the GraphQL `Repository` shape. */
export const GitHubRepo = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  url: z.string().optional(),
  description: nullableString(),
  isArchived: z.boolean().optional(),
});
export type GitHubRepo = z.infer<typeof GitHubRepo>;

/**
 * GitHub's GraphQL `IssueState` enum, upper case (`OPEN`/`CLOSED`) as the API
 * actually returns it — confirmed against live data, since every hand-written
 * test fixture in this codebase had assumed lower case and none had been
 * exercised against a real response. Normalised to lower case here, once, at
 * the parse boundary, so every other schema and the rest of the app can work
 * in the lower-case convention `built-in-types.ts`'s data schemas already use.
 */
const GitHubIssueState = z.enum(["OPEN", "CLOSED"]).transform((value): "open" | "closed" => {
  switch (value) {
    case "OPEN":
      return "open";
    case "CLOSED":
      return "closed";
  }
});

/** GitHub's GraphQL `PullRequestState` enum: an issue's two states plus `MERGED`. */
const GitHubPullRequestState = z
  .enum(["OPEN", "CLOSED", "MERGED"])
  .transform((value): "open" | "closed" | "merged" => {
    switch (value) {
      case "OPEN":
        return "open";
      case "CLOSED":
        return "closed";
      case "MERGED":
        return "merged";
    }
  });

/** A GitHub issue. State is required from the issues connection. */
export const GitHubIssue = z.object({
  number: z.number().int(),
  title: z.string(),
  state: GitHubIssueState,
  url: z.string(),
});
export type GitHubIssue = z.infer<typeof GitHubIssue>;

/**
 * A GitHub issue plus its own owning repository. Blocking relationships
 * (`Issue.blockedBy`/`Issue.blocking`) are explicitly cross-repo capable,
 * unlike sub-issues, so — like {@link GitHubProjectItem}'s nested Issue
 * content — the fetched issue's repository can't be assumed to be the same
 * as the source issue's and must be selected and used directly.
 */
export const GitHubIssueWithRepo = GitHubIssue.extend({
  repository: z.object({ name: z.string(), owner: z.object({ login: z.string() }) }),
});
export type GitHubIssueWithRepo = z.infer<typeof GitHubIssueWithRepo>;

/**
 * A GitHub pull request. State adds "merged" alongside an issue's open/closed.
 * `baseRefName`/`headRefName` are the branch names GitHub exposes no direct
 * "which PR is this based on" field for — stacking is inferred client-side by
 * matching one PR's `baseRefName` against another's `headRefName`.
 * `isCrossRepository` marks a fork PR, whose `headRefName` names a branch in
 * the fork rather than this repo, so it can never legitimately be another
 * PR's `baseRefName` here.
 */
export const GitHubPullRequest = z.object({
  number: z.number().int(),
  title: z.string(),
  state: GitHubPullRequestState,
  url: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  isCrossRepository: z.boolean(),
});
export type GitHubPullRequest = z.infer<typeof GitHubPullRequest>;

/** A GitHub Projects v2 project. `id` is the GraphQL node id used to fetch items. */
export const GitHubProject = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  closed: z.boolean().optional(),
});
export type GitHubProject = z.infer<typeof GitHubProject>;

/**
 * The `content` of a Projects v2 item. Only `Issue` and `DraftIssue` are
 * modelled: those are the kinds that become graph nodes. `PullRequest` items
 * are intentionally absent — they are dropped during materialisation (see the
 * response schema's {@link RawProjectItemContent}, whose third arm captures any
 * other `__typename` so a PR object parses but is then filtered out).
 */
const IssueContent = z.object({
  __typename: z.literal("Issue"),
  number: z.number().int(),
  title: z.string(),
  state: GitHubIssueState.optional(),
  url: z.string(),
  repository: z.object({
    name: z.string(),
    owner: z.object({ login: z.string() }),
  }),
});

const DraftIssueContent = z.object({
  __typename: z.literal("DraftIssue"),
  title: z.string(),
});

export const GitHubProjectItem = z.discriminatedUnion("__typename", [
  IssueContent,
  DraftIssueContent,
]);
export type GitHubProjectItem = z.infer<typeof GitHubProjectItem>;

/** Relay connection page info. `endCursor` is null when there is no next page. */
export const PageInfo = z.object({
  hasNextPage: z.boolean(),
  endCursor: z.string().nullable(),
});
export type PageInfo = z.infer<typeof PageInfo>;

/** The `rateLimit { remaining resetAt }` block every query selects. */
export const RateLimit = z.object({
  remaining: z.number().int(),
  resetAt: z.string(),
});
export type RateLimit = z.infer<typeof RateLimit>;

/** Builds a Relay connection schema wrapping `nodeSchema` in pageInfo + nodes. */
function connection<T extends z.ZodType>(nodeSchema: T) {
  return z.object({
    pageInfo: PageInfo,
    nodes: z.array(nodeSchema),
  });
}

// --- Per-query response envelopes -------------------------------------------

export const ViewerResponse = z.object({
  data: z.object({
    viewer: GitHubViewer,
    rateLimit: RateLimit,
  }),
});
export type ViewerResponse = z.infer<typeof ViewerResponse>;

export const ViewerOrgsResponse = z.object({
  data: z.object({
    viewer: z.object({
      login: z.string(),
      organizations: connection(GitHubOrg),
    }),
    rateLimit: RateLimit,
  }),
});
export type ViewerOrgsResponse = z.infer<typeof ViewerOrgsResponse>;

/** `organization` is nullable: GitHub returns `null` for an unknown login. */
export const OrgReposResponse = z.object({
  data: z.object({
    organization: z
      .object({
        repositories: connection(GitHubRepo),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type OrgReposResponse = z.infer<typeof OrgReposResponse>;

/** `organization` is nullable: GitHub returns `null` for an unknown login. */
export const OrgProjectsResponse = z.object({
  data: z.object({
    organization: z
      .object({
        projectsV2: connection(GitHubProject),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type OrgProjectsResponse = z.infer<typeof OrgProjectsResponse>;

/** `repository` is nullable: GitHub returns `null` for an unknown name. */
export const RepoIssuesResponse = z.object({
  data: z.object({
    repository: z
      .object({
        issues: connection(GitHubIssue),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type RepoIssuesResponse = z.infer<typeof RepoIssuesResponse>;

/**
 * `repository` is nullable (unknown owner/name); its nested `issue` is
 * independently nullable (unknown issue number in a known repo) — mirrors
 * {@link OrgProjectResponse}'s two-level nullability for the same reason.
 * `subIssues` is structurally `Issue`, so no new entity schema is needed
 * beyond this envelope. Deliberately `subIssues`, not the similarly-named
 * `trackedIssues` — confirmed against real sub-issue data (created via both
 * the REST API and `addSubIssue`) that `trackedIssues` stays empty for a
 * genuine sub-issue relationship; `subIssues`/`parent` are the fields that
 * actually reflect it. `trackedIssues` is a distinct, older GitHub concept.
 */
export const IssueSubIssuesResponse = z.object({
  data: z.object({
    repository: z
      .object({
        issue: z.object({ subIssues: connection(GitHubIssue) }).nullable(),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type IssueSubIssuesResponse = z.infer<typeof IssueSubIssuesResponse>;

/**
 * `blockedBy`/`blocking` mirror {@link IssueSubIssuesResponse}'s two-level
 * nullability exactly, but wrap {@link GitHubIssueWithRepo} rather than
 * {@link GitHubIssue} since a blocking relationship can cross repositories.
 */
export const IssueBlockedByResponse = z.object({
  data: z.object({
    repository: z
      .object({
        issue: z.object({ blockedBy: connection(GitHubIssueWithRepo) }).nullable(),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type IssueBlockedByResponse = z.infer<typeof IssueBlockedByResponse>;

export const IssueBlockingResponse = z.object({
  data: z.object({
    repository: z
      .object({
        issue: z.object({ blocking: connection(GitHubIssueWithRepo) }).nullable(),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type IssueBlockingResponse = z.infer<typeof IssueBlockingResponse>;

/** `repository` is nullable: GitHub returns `null` for an unknown name. */
export const RepoPullRequestsResponse = z.object({
  data: z.object({
    repository: z
      .object({
        pullRequests: connection(GitHubPullRequest),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type RepoPullRequestsResponse = z.infer<typeof RepoPullRequestsResponse>;

/** `repository` is nullable: GitHub returns `null` for an unknown name. */
export const RepoProjectsResponse = z.object({
  data: z.object({
    repository: z
      .object({
        projectsV2: connection(GitHubProject),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type RepoProjectsResponse = z.infer<typeof RepoProjectsResponse>;

/**
 * `organization` is nullable (unknown login); its nested `projectV2` is
 * independently nullable (unknown project number for a known org) —
 * confirmed empirically: GitHub reports either case as HTTP 200 with the
 * relevant field `null` plus a `NOT_FOUND` GraphQL error, never HTTP 404.
 */
export const OrgProjectResponse = z.object({
  data: z.object({
    organization: z.object({ projectV2: GitHubProject.nullable() }).nullable(),
    rateLimit: RateLimit,
  }),
});
export type OrgProjectResponse = z.infer<typeof OrgProjectResponse>;

/** `user` is nullable; its nested `projectV2` is independently nullable —
 *  mirrors {@link OrgProjectResponse} for a user-owned project. */
export const UserProjectResponse = z.object({
  data: z.object({
    user: z.object({ projectV2: GitHubProject.nullable() }).nullable(),
    rateLimit: RateLimit,
  }),
});
export type UserProjectResponse = z.infer<typeof UserProjectResponse>;

/** `repository` is nullable: GitHub returns `null` for an unknown owner/name. */
export const RepoResponse = z.object({
  data: z.object({
    repository: GitHubRepo.nullable(),
    rateLimit: RateLimit,
  }),
});
export type RepoResponse = z.infer<typeof RepoResponse>;

/**
 * Content of a project item at the response level. The first two arms are the
 * materialisable kinds ({@link IssueContent}, {@link DraftIssueContent}); the
 * third is a permissive passthrough keyed on any `__typename`, which lets a
 * `PullRequest` (or any other unselected content) parse successfully so the
 * adapter can drop it during materialisation rather than treat the whole
 * response as invalid.
 */
const UnrecognisedContent = z.object({ __typename: z.string() }).passthrough();
const RawProjectItemContent = z.union([
  IssueContent,
  DraftIssueContent,
  UnrecognisedContent,
]);

/** `node` is nullable: GitHub returns `null` for an unknown project node id. */
export const ProjectItemsResponse = z.object({
  data: z.object({
    node: z
      .object({
        items: connection(z.object({ content: RawProjectItemContent })),
      })
      .nullable(),
    rateLimit: RateLimit,
  }),
});
export type ProjectItemsResponse = z.infer<typeof ProjectItemsResponse>;
