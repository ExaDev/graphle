import type { RepoIssuesFilters, RepoPullRequestsFilters } from "./filters";
import type {
  GitHubIssue,
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
