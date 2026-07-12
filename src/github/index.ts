/**
 * Client-side GitHub GraphQL client and graph materialisation. The pure
 * contract, schemas, errors, and expansion logic are independent of the network
 * adapter so they can be exercised without touching `fetch`.
 */
export type { GitHubClient, Page } from "./contract";
export { createGitHubClient, PAGE_SIZE } from "./graphql-adapter";
export {
  GitHubError,
  classifyByStatus,
  githubErrorMessage,
  type GitHubErrorKind,
} from "./errors";
export {
  GitHubIssue,
  GitHubIssueWithRepo,
  GitHubOrg,
  GitHubProject,
  GitHubProjectItem,
  GitHubPullRequest,
  GitHubPullRequestWithRepo,
  GitHubRepo,
  GitHubSearchAccount,
  GitHubViewer,
  PageInfo,
  RateLimit,
} from "./schema";
export {
  buildDelta,
  containsEdge,
  issueToNode,
  issueWithRepoToNode,
  orgToNode,
  ownsEdge,
  projectIssueItemToNode,
  projectToNode,
  pullRequestToNode,
  pullRequestWithRepoToNode,
  repoToNode,
  tracksEdge,
} from "./materialise";
export { expansionsForType, type Expansion, type ExpansionResult } from "./expand";
export {
  canonicalProjectUrl,
  parseProjectFilterQuery,
  parseProjectUrl,
  type ParsedProjectUrl,
  type ProjectOwnerType,
} from "./project-url";
export { loadProjectDocument, type ProjectLoadResult } from "./project-loader";
export {
  canonicalRepoIssuesUrl,
  canonicalRepoPullRequestsUrl,
  parseRepoIssuesFilters,
  parseRepoIssuesUrl,
  parseRepoPullRequestsFilters,
  parseRepoPullRequestsUrl,
  type ParsedRepoListUrl,
} from "./repo-list-url";
export {
  loadRepoIssuesDocument,
  loadRepoPullRequestsDocument,
  type RepoListLoadResult,
} from "./repo-list-loader";
export {
  DEFAULT_REPO_ISSUES_FILTERS,
  DEFAULT_REPO_PULL_REQUESTS_FILTERS,
  isIssueSortField,
  isIssueState,
  isPullRequestSortField,
  isPullRequestState,
  isSortDirection,
  type IssueSortField,
  type IssueState,
  type PullRequestSortField,
  type PullRequestState,
  type RepoIssuesFilters,
  type RepoPullRequestsFilters,
  type SortDirection,
} from "./filters";
