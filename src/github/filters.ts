/**
 * Filter/sort parameters for the repo issues and pull-requests GraphQL
 * connections — real, first-class server-side arguments GitHub's API
 * exposes (`states`, `labels`, `orderBy`), not a client-side approximation.
 * Kept as one small file since `graphql-adapter.ts` (which maps these to
 * GitHub's upper-case enums), `repo-list-url.ts`/`repo-list-loader.ts`, and
 * the UI layer all need the same shapes.
 *
 * Issues and pull requests are typed separately rather than sharing one
 * union: an issue's `state` has no "merged" value, and `IssueOrderField`
 * supports sorting by `COMMENTS` where `PullRequestOrderField` does not —
 * collapsing them into one shape would let an issue filter claim "merged"
 * is selectable, which GitHub's `IssueState` enum would reject.
 */

export type IssueState = "open" | "closed";
export type PullRequestState = "open" | "closed" | "merged";
export type IssueSortField = "created" | "updated" | "comments";
export type PullRequestSortField = "created" | "updated";
export type SortDirection = "asc" | "desc";

export interface RepoIssuesFilters {
  /** Non-empty — GitHub defaults to `[OPEN, CLOSED]` when omitted, which is
   *  never what we want silently; the caller always states its choice. */
  states: readonly IssueState[];
  sort: { field: IssueSortField; direction: SortDirection };
  /** Empty means "no label filter", not "match zero labels". */
  labels: readonly string[];
}

export interface RepoPullRequestsFilters {
  states: readonly PullRequestState[];
  sort: { field: PullRequestSortField; direction: SortDirection };
  labels: readonly string[];
}

/** Today's previously-hardcoded behaviour (`states:[OPEN]`, sorted by most
 *  recently updated) — the fallback when nothing in a URL specifies filters,
 *  and what the interactive repo-issues Expand entry keeps using unchanged. */
export const DEFAULT_REPO_ISSUES_FILTERS: RepoIssuesFilters = {
  states: ["open"],
  sort: { field: "updated", direction: "desc" },
  labels: [],
};

/** Mirrors {@link DEFAULT_REPO_ISSUES_FILTERS} for pull requests. */
export const DEFAULT_REPO_PULL_REQUESTS_FILTERS: RepoPullRequestsFilters = {
  states: ["open"],
  sort: { field: "updated", direction: "desc" },
  labels: [],
};

export function isIssueState(value: string): value is IssueState {
  return value === "open" || value === "closed";
}

export function isPullRequestState(value: string): value is PullRequestState {
  return value === "open" || value === "closed" || value === "merged";
}

export function isIssueSortField(value: string): value is IssueSortField {
  return value === "created" || value === "updated" || value === "comments";
}

export function isPullRequestSortField(value: string): value is PullRequestSortField {
  return value === "created" || value === "updated";
}

export function isSortDirection(value: string): value is SortDirection {
  return value === "asc" || value === "desc";
}
