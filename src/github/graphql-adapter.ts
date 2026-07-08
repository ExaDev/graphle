import type { GitHubClient } from "./contract";
import { GitHubError, classifyByStatus } from "./errors";
import {
  OrgProjectsResponse,
  OrgReposResponse,
  ProjectItemsResponse,
  RepoIssuesResponse,
  RepoProjectsResponse,
  ViewerOrgsResponse,
  ViewerResponse,
  type GitHubProjectItem,
} from "./schema";
import type { z } from "zod";

/** GitHub GraphQL API endpoint. */
const GRAPHQL_ENDPOINT = "https://api.github.com/graphql";

/**
 * Page size for every paginated query. 50 is a sensible balance between request
 * count and per-response payload size for the entities this client fetches.
 */
export const PAGE_SIZE = 50;

// --- Query documents (verbatim per the documented operation shapes) ---------

const VIEWER_QUERY = `query Viewer { viewer { login } rateLimit { remaining resetAt } }`;

const VIEWER_ORGS_QUERY = `query ViewerOrgs($first:Int!,$after:String){ viewer { login organizations(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{login name url avatarUrl} } } rateLimit{remaining resetAt} }`;

const ORG_REPOS_QUERY = `query OrgRepos($login:String!,$first:Int!,$after:String){ organization(login:$login){ repositories(first:$first,after:$after,orderBy:{field:UPDATED_AT,direction:DESC}){ pageInfo{hasNextPage endCursor} nodes{ name owner{login} url description isArchived } } } rateLimit{remaining resetAt} }`;

const REPO_ISSUES_QUERY = `query RepoIssues($owner:String!,$name:String!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ issues(first:$first,after:$after,states:[OPEN],orderBy:{field:UPDATED_AT,direction:DESC}){ pageInfo{hasNextPage endCursor} nodes{ number title state url } } } rateLimit{remaining resetAt} }`;

const ORG_PROJECTS_QUERY = `query OrgProjects($login:String!,$first:Int!,$after:String){ organization(login:$login){ projectsV2(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ id number title url closed } } } rateLimit{remaining resetAt} }`;

const REPO_PROJECTS_QUERY = `query RepoProjects($owner:String!,$name:String!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ projectsV2(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ id number title url closed } } } rateLimit{remaining resetAt} }`;

const PROJECT_ITEMS_QUERY = `query ProjectItems($projectId:ID!,$first:Int!,$after:String){ node(id:$projectId){ ...on ProjectV2 { items(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ content{ __typename ...on Issue{ number title state url repository{name owner{login}} } ...on DraftIssue{ title } } } } } } rateLimit{remaining resetAt} }`;

/** Returns the GraphQL `errors` array from `body`, or undefined when absent. */
function extractErrors(body: unknown): unknown[] | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  if (!("errors" in body)) return undefined;
  const errors = body.errors;
  return Array.isArray(errors) ? errors : undefined;
}

/**
 * Creates a {@link GitHubClient} backed by the GitHub GraphQL API. `fetch` is
 * injectable so tests can stub responses without touching the network; when
 * omitted the global `fetch` is used. Every method threads the {@link AbortSignal}
 * through to `fetch` and throws {@link GitHubError} on any failure.
 */
export function createGitHubClient(parameters: {
  token: string;
  fetch?: typeof globalThis.fetch;
}): GitHubClient {
  // Dependency-injection default: a real client uses global fetch; a test
  // supplies a stub. This is the absence-modelled-at-the-boundary pattern, not a
  // silent value fallback.
  const doFetch = parameters.fetch ?? globalThis.fetch;
  let lastRateLimit: { remaining: number; resetAt: string } | undefined;

  /**
   * Sends a GraphQL operation, classifies any HTTP or GraphQL error, and parses
   * the success body with `schema`, returning the full response envelope. Each
   * method navigates the envelope's `data` and updates {@link lastRateLimit}
   * from its own well-typed `result.data.rateLimit`. Network rejections
   * (including abort) surface as `network`; unparseable bodies surface as
   * `invalidResponse`.
   */
  async function graphql<S extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    schema: S,
    signal: AbortSignal,
  ): Promise<z.infer<S>> {
    let response: Response;
    try {
      response = await doFetch(GRAPHQL_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${parameters.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal,
      });
    } catch (cause) {
      // A rejected fetch covers both genuine network failures and an aborted
      // signal; both are reported as `network` so callers have one branch.
      throw new GitHubError({ type: "network", cause });
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new GitHubError({
        type: "invalidResponse",
        message: "response body was not valid JSON",
      });
    }

    const errors = extractErrors(body);
    if (!response.ok || (errors !== undefined && errors.length > 0)) {
      throw new GitHubError(classifyByStatus(response.status, body, errors));
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new GitHubError({
        type: "invalidResponse",
        message: parsed.error.message,
      });
    }
    return parsed.data;
  }

  /** Maps a Relay `pageInfo` to the transport-agnostic page tail. */
  function toPage(pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
  }): { endCursor: string | undefined; hasNextPage: boolean } {
    return {
      endCursor: pageInfo.endCursor ?? undefined,
      hasNextPage: pageInfo.hasNextPage,
    };
  }

  return {
    get lastRateLimit() {
      return lastRateLimit;
    },

    async viewer(signal: AbortSignal) {
      const result = await graphql(
        VIEWER_QUERY,
        {},
        ViewerResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      return result.data.viewer;
    },

    async listViewerOrgs(cursor, signal) {
      const result = await graphql(
        VIEWER_ORGS_QUERY,
        { first: PAGE_SIZE, after: cursor },
        ViewerOrgsResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const orgs = result.data.viewer.organizations;
      return {
        items: orgs.nodes,
        ...toPage(orgs.pageInfo),
      };
    },

    async listOrgRepos(login, cursor, signal) {
      const result = await graphql(
        ORG_REPOS_QUERY,
        { login, first: PAGE_SIZE, after: cursor },
        OrgReposResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const org = result.data.organization;
      if (org === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const repos = org.repositories;
      return { items: repos.nodes, ...toPage(repos.pageInfo) };
    },

    async listRepoIssues(owner, name, cursor, signal) {
      const result = await graphql(
        REPO_ISSUES_QUERY,
        { owner, name, first: PAGE_SIZE, after: cursor },
        RepoIssuesResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const issues = repo.issues;
      return { items: issues.nodes, ...toPage(issues.pageInfo) };
    },

    async listOrgProjects(login, cursor, signal) {
      const result = await graphql(
        ORG_PROJECTS_QUERY,
        { login, first: PAGE_SIZE, after: cursor },
        OrgProjectsResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const org = result.data.organization;
      if (org === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const projects = org.projectsV2;
      return { items: projects.nodes, ...toPage(projects.pageInfo) };
    },

    async listRepoProjects(owner, name, cursor, signal) {
      const result = await graphql(
        REPO_PROJECTS_QUERY,
        { owner, name, first: PAGE_SIZE, after: cursor },
        RepoProjectsResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const projects = repo.projectsV2;
      return { items: projects.nodes, ...toPage(projects.pageInfo) };
    },

    async listProjectItems(projectNodeId, cursor, signal) {
      const result = await graphql(
        PROJECT_ITEMS_QUERY,
        { projectId: projectNodeId, first: PAGE_SIZE, after: cursor },
        ProjectItemsResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const node = result.data.node;
      if (node === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const rawItems = node.items;
      // Drop items whose content is neither Issue nor DraftIssue (notably
      // PullRequests): they parse against the response's permissive third arm
      // and are filtered here so the Page only carries materialisable items.
      const items: GitHubProjectItem[] = rawItems.nodes
        .map((item) => item.content)
        .filter(
          (content): content is GitHubProjectItem =>
            content.__typename === "Issue" || content.__typename === "DraftIssue",
        );
      return { items, ...toPage(rawItems.pageInfo) };
    },
  };
}
