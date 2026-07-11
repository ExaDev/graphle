import type { GitHubClient } from "./contract";
import { GitHubError, classifyByStatus } from "./errors";
import type {
  IssueSortField,
  IssueState,
  PullRequestSortField,
  PullRequestState,
  SortDirection,
} from "./filters";
import {
  IssueBlockedByResponse,
  IssueBlockingResponse,
  IssueSubIssuesResponse,
  OrgProjectResponse,
  OrgProjectsResponse,
  OrgReposResponse,
  ProjectItemsResponse,
  RepoIssuesResponse,
  RepoProjectsResponse,
  RepoPullRequestsResponse,
  RepoResponse,
  UserProjectResponse,
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

const REPO_ISSUES_QUERY = `query RepoIssues($owner:String!,$name:String!,$first:Int!,$after:String,$states:[IssueState!]!,$orderByField:IssueOrderField!,$orderByDirection:OrderDirection!,$labels:[String!]){ repository(owner:$owner,name:$name){ issues(first:$first,after:$after,states:$states,labels:$labels,orderBy:{field:$orderByField,direction:$orderByDirection}){ pageInfo{hasNextPage endCursor} nodes{ number title state url } } } rateLimit{remaining resetAt} }`;

const REPO_PULL_REQUESTS_QUERY = `query RepoPullRequests($owner:String!,$name:String!,$first:Int!,$after:String,$states:[PullRequestState!]!,$orderByField:PullRequestOrderField!,$orderByDirection:OrderDirection!,$labels:[String!]){ repository(owner:$owner,name:$name){ pullRequests(first:$first,after:$after,states:$states,labels:$labels,orderBy:{field:$orderByField,direction:$orderByDirection}){ pageInfo{hasNextPage endCursor} nodes{ number title state url } } } rateLimit{remaining resetAt} }`;

const ORG_PROJECTS_QUERY = `query OrgProjects($login:String!,$first:Int!,$after:String){ organization(login:$login){ projectsV2(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ id number title url closed } } } rateLimit{remaining resetAt} }`;

const REPO_PROJECTS_QUERY = `query RepoProjects($owner:String!,$name:String!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ projectsV2(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ id number title url closed } } } rateLimit{remaining resetAt} }`;

// GitHub's `subIssues` connection has no states/labels/orderBy argument,
// unlike `issues`/`pullRequests` — confirmed against the GraphQL schema
// reference, not assumed. Deliberately `subIssues`, not `trackedIssues`: the
// two are distinct fields (confirmed via introspection and against real
// sub-issue fixture data — `trackedIssues` stays empty for a genuine
// sub-issue relationship created via the REST API or `addSubIssue`; only
// `subIssues`/`parent` reflect it).
const ISSUE_SUB_ISSUES_QUERY = `query IssueSubIssues($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ issue(number:$number){ subIssues(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ number title state url } } } } rateLimit{remaining resetAt} }`;

const ISSUE_BLOCKED_BY_QUERY = `query IssueBlockedBy($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ issue(number:$number){ blockedBy(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ number title state url repository{name owner{login}} } } } } rateLimit{remaining resetAt} }`;

const ISSUE_BLOCKING_QUERY = `query IssueBlocking($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){ repository(owner:$owner,name:$name){ issue(number:$number){ blocking(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ number title state url repository{name owner{login}} } } } } rateLimit{remaining resetAt} }`;

const PROJECT_ITEMS_QUERY = `query ProjectItems($projectId:ID!,$first:Int!,$after:String){ node(id:$projectId){ ...on ProjectV2 { items(first:$first,after:$after){ pageInfo{hasNextPage endCursor} nodes{ content{ __typename ...on Issue{ number title state url repository{name owner{login}} } ...on DraftIssue{ title } } } } } } rateLimit{remaining resetAt} }`;

const ORG_PROJECT_QUERY = `query OrgProject($login:String!,$number:Int!){ organization(login:$login){ projectV2(number:$number){ id number title url closed } } rateLimit{remaining resetAt} }`;

const USER_PROJECT_QUERY = `query UserProject($login:String!,$number:Int!){ user(login:$login){ projectV2(number:$number){ id number title url closed } } rateLimit{remaining resetAt} }`;

const REPO_QUERY = `query Repo($owner:String!,$name:String!){ repository(owner:$owner,name:$name){ owner{login} name url description isArchived } rateLimit{remaining resetAt} }`;

/** Maps a lower-case {@link IssueState} to GitHub's `IssueState` GraphQL enum. */
function issueStateToGraphQL(state: IssueState): "OPEN" | "CLOSED" {
  switch (state) {
    case "open":
      return "OPEN";
    case "closed":
      return "CLOSED";
  }
}

/** Maps a lower-case {@link PullRequestState} to GitHub's `PullRequestState`
 *  GraphQL enum. */
function pullRequestStateToGraphQL(state: PullRequestState): "OPEN" | "CLOSED" | "MERGED" {
  switch (state) {
    case "open":
      return "OPEN";
    case "closed":
      return "CLOSED";
    case "merged":
      return "MERGED";
  }
}

/** Maps a lower-case {@link IssueSortField} to GitHub's `IssueOrderField`
 *  GraphQL enum. */
function issueSortFieldToGraphQL(field: IssueSortField): "CREATED_AT" | "UPDATED_AT" | "COMMENTS" {
  switch (field) {
    case "created":
      return "CREATED_AT";
    case "updated":
      return "UPDATED_AT";
    case "comments":
      return "COMMENTS";
  }
}

/** Maps a lower-case {@link PullRequestSortField} to GitHub's
 *  `PullRequestOrderField` GraphQL enum. */
function pullRequestSortFieldToGraphQL(field: PullRequestSortField): "CREATED_AT" | "UPDATED_AT" {
  switch (field) {
    case "created":
      return "CREATED_AT";
    case "updated":
      return "UPDATED_AT";
  }
}

/** Maps a lower-case {@link SortDirection} to GitHub's `OrderDirection`
 *  GraphQL enum. */
function sortDirectionToGraphQL(direction: SortDirection): "ASC" | "DESC" {
  switch (direction) {
    case "asc":
      return "ASC";
    case "desc":
      return "DESC";
  }
}

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

    async listRepoIssues(owner, name, cursor, filters, signal) {
      const result = await graphql(
        REPO_ISSUES_QUERY,
        {
          owner,
          name,
          first: PAGE_SIZE,
          after: cursor,
          states: filters.states.map(issueStateToGraphQL),
          orderByField: issueSortFieldToGraphQL(filters.sort.field),
          orderByDirection: sortDirectionToGraphQL(filters.sort.direction),
          labels: filters.labels.length === 0 ? undefined : filters.labels,
        },
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

    async listRepoPullRequests(owner, name, cursor, filters, signal) {
      const result = await graphql(
        REPO_PULL_REQUESTS_QUERY,
        {
          owner,
          name,
          first: PAGE_SIZE,
          after: cursor,
          states: filters.states.map(pullRequestStateToGraphQL),
          orderByField: pullRequestSortFieldToGraphQL(filters.sort.field),
          orderByDirection: sortDirectionToGraphQL(filters.sort.direction),
          labels: filters.labels.length === 0 ? undefined : filters.labels,
        },
        RepoPullRequestsResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const pullRequests = repo.pullRequests;
      return { items: pullRequests.nodes, ...toPage(pullRequests.pageInfo) };
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

    async listIssueSubIssues(owner, name, issueNumber, cursor, signal) {
      const result = await graphql(
        ISSUE_SUB_ISSUES_QUERY,
        { owner, name, number: issueNumber, first: PAGE_SIZE, after: cursor },
        IssueSubIssuesResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const issue = repo.issue;
      if (issue === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const subIssues = issue.subIssues;
      return { items: subIssues.nodes, ...toPage(subIssues.pageInfo) };
    },

    async listIssueBlockedBy(owner, name, issueNumber, cursor, signal) {
      const result = await graphql(
        ISSUE_BLOCKED_BY_QUERY,
        { owner, name, number: issueNumber, first: PAGE_SIZE, after: cursor },
        IssueBlockedByResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const issue = repo.issue;
      if (issue === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const blockedBy = issue.blockedBy;
      return { items: blockedBy.nodes, ...toPage(blockedBy.pageInfo) };
    },

    async listIssueBlocking(owner, name, issueNumber, cursor, signal) {
      const result = await graphql(
        ISSUE_BLOCKING_QUERY,
        { owner, name, number: issueNumber, first: PAGE_SIZE, after: cursor },
        IssueBlockingResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const issue = repo.issue;
      if (issue === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const blocking = issue.blocking;
      return { items: blocking.nodes, ...toPage(blocking.pageInfo) };
    },

    async getOrgProject(login, number, signal) {
      const result = await graphql(
        ORG_PROJECT_QUERY,
        { login, number },
        OrgProjectResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const org = result.data.organization;
      if (org === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const project = org.projectV2;
      if (project === null) {
        throw new GitHubError({ type: "notFound" });
      }
      return project;
    },

    async getUserProject(login, number, signal) {
      const result = await graphql(
        USER_PROJECT_QUERY,
        { login, number },
        UserProjectResponse,
        signal,
      );
      lastRateLimit = result.data.rateLimit;
      const user = result.data.user;
      if (user === null) {
        throw new GitHubError({ type: "notFound" });
      }
      const project = user.projectV2;
      if (project === null) {
        throw new GitHubError({ type: "notFound" });
      }
      return project;
    },

    async getRepo(owner, name, signal) {
      const result = await graphql(REPO_QUERY, { owner, name }, RepoResponse, signal);
      lastRateLimit = result.data.rateLimit;
      const repo = result.data.repository;
      if (repo === null) {
        throw new GitHubError({ type: "notFound" });
      }
      return repo;
    },
  };
}
