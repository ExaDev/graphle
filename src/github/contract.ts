import type { RepoIssuesFilters, RepoPullRequestsFilters } from "./filters";
import type {
  GitHubIssue,
  GitHubIssueWithRepo,
  GitHubOrg,
  GitHubProject,
  GitHubProjectItem,
  GitHubPullRequest,
  GitHubRepo,
  GitHubViewer,
} from "./schema";

/**
 * One page of a paginated GitHub connection. `endCursor` is `undefined` rather
 * than `null` when there is no next page, matching the rest of the codebase's
 * "absence is `undefined`" convention; pass it straight back as the next
 * request's `after` to advance.
 */
export type Page<T> = {
  items: T[];
  endCursor: string | undefined;
  hasNextPage: boolean;
};

/**
 * The surface the GitHub client exposes. Every method takes an {@link AbortSignal}
 * so callers can cancel an in-flight request, and most are cursor-paginated.
 * {@link lastRateLimit} reflects the most recent successful response's rate
 * budget so the UI can warn before a request would exhaust it.
 */
export interface GitHubClient {
  viewer(signal: AbortSignal): Promise<GitHubViewer>;
  listViewerOrgs(
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubOrg>>;
  listOrgRepos(
    login: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubRepo>>;
  listRepoIssues(
    owner: string,
    name: string,
    cursor: string | undefined,
    filters: RepoIssuesFilters,
    signal: AbortSignal,
  ): Promise<Page<GitHubIssue>>;
  listRepoPullRequests(
    owner: string,
    name: string,
    cursor: string | undefined,
    filters: RepoPullRequestsFilters,
    signal: AbortSignal,
  ): Promise<Page<GitHubPullRequest>>;
  listOrgProjects(
    login: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubProject>>;
  listRepoProjects(
    owner: string,
    name: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubProject>>;
  listProjectItems(
    projectNodeId: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubProjectItem>>;
  /** List an issue's sub-issues (GitHub's `Issue.subIssues` connection — not
   *  the similarly-named `trackedIssues`, a distinct field that stays empty
   *  for a genuine sub-issue relationship, confirmed against real fixture
   *  data). Unlike `listRepoIssues`, this connection has no `states`/
   *  `labels`/`orderBy` arguments in GitHub's schema — every sub-issue is
   *  returned, unfiltered and in GitHub's own order. Throws
   *  `GitHubError({type:"notFound"})` when the owner/name/issueNumber
   *  doesn't resolve. */
  listIssueSubIssues(
    owner: string,
    name: string,
    issueNumber: number,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubIssue>>;
  /** List the issues blocking an issue (GitHub's `Issue.blockedBy` connection).
   *  No filter arguments, same as `listIssueSubIssues`. Unlike sub-issues, a
   *  blocking relationship can cross repositories, so each returned issue
   *  carries its own owner/repo. Throws `GitHubError({type:"notFound"})` when
   *  the owner/name/issueNumber doesn't resolve. */
  listIssueBlockedBy(
    owner: string,
    name: string,
    issueNumber: number,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubIssueWithRepo>>;
  /** List the issues an issue is blocking (GitHub's `Issue.blocking`
   *  connection). Mirrors {@link listIssueBlockedBy} in every other respect. */
  listIssueBlocking(
    owner: string,
    name: string,
    issueNumber: number,
    cursor: string | undefined,
    signal: AbortSignal,
  ): Promise<Page<GitHubIssueWithRepo>>;
  /** Resolve an org-owned project by its number (as shown in its URL, e.g.
   *  `/orgs/{login}/projects/{number}`). Throws `GitHubError({type:"notFound"})`
   *  when the org or the project number doesn't exist or isn't visible. */
  getOrgProject(
    login: string,
    number: number,
    signal: AbortSignal,
  ): Promise<GitHubProject>;
  /** Resolve a user-owned project by its number (`/users/{login}/projects/{number}`).
   *  Mirrors {@link getOrgProject} for the user-owned case. */
  getUserProject(
    login: string,
    number: number,
    signal: AbortSignal,
  ): Promise<GitHubProject>;
  /** Resolve a single repository by its owner and name (`/{owner}/{name}`).
   *  Throws `GitHubError({type:"notFound"})` when the owner or repo doesn't
   *  exist or isn't visible. */
  getRepo(owner: string, name: string, signal: AbortSignal): Promise<GitHubRepo>;
  readonly lastRateLimit: { remaining: number; resetAt: string } | undefined;
}
