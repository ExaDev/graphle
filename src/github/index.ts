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
  GitHubOrg,
  GitHubProject,
  GitHubProjectItem,
  GitHubRepo,
  GitHubViewer,
  PageInfo,
  RateLimit,
} from "./schema";
export {
  buildDelta,
  containsEdge,
  issueToNode,
  orgToNode,
  ownsEdge,
  projectIssueItemToNode,
  projectToNode,
  repoToNode,
  tracksEdge,
} from "./materialise";
export { expansionsForType, type Expansion, type ExpansionResult } from "./expand";
export {
  canonicalProjectUrl,
  parseProjectUrl,
  type ParsedProjectUrl,
  type ProjectOwnerType,
} from "./project-url";
export { loadProjectDocument, type ProjectLoadResult } from "./project-loader";
