import { describe, expect, it } from "vitest";

import { DEFAULT_REPO_ISSUES_FILTERS, DEFAULT_REPO_PULL_REQUESTS_FILTERS } from "./filters";
import { loadRepoIssuesDocument, loadRepoPullRequestsDocument } from "./repo-list-loader";
import type { GitHubClient, Page } from "./contract";
import type { GitHubIssue, GitHubPullRequest, GitHubRepo } from "./schema";

const repo: GitHubRepo = {
  name: "graphle",
  owner: { login: "exadev" },
  url: "https://github.com/exadev/graphle",
  description: "A client-side graph tool",
  isArchived: false,
};

function issue(number: number, title: string): GitHubIssue {
  return {
    number,
    title,
    state: "open",
    url: `https://github.com/exadev/graphle/issues/${String(number)}`,
  };
}

function pullRequest(number: number, title: string): GitHubPullRequest {
  return {
    number,
    title,
    state: "open",
    url: `https://github.com/exadev/graphle/pull/${String(number)}`,
    baseRefName: "main",
    headRefName: `feature-${String(number)}`,
    isCrossRepository: false,
  };
}

/** A client that fails loudly on any call the test doesn't expect. */
function unreachableClient(): GitHubClient {
  const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected ${name} call`));
  return {
    viewer: unexpected("viewer"),
    listViewerOrgs: unexpected("listViewerOrgs"),
    listOrgRepos: unexpected("listOrgRepos"),
    listUserRepos: unexpected("listUserRepos"),
    listRepoIssues: unexpected("listRepoIssues"),
    listRepoPullRequests: unexpected("listRepoPullRequests"),
    listOrgProjects: unexpected("listOrgProjects"),
    listUserProjects: unexpected("listUserProjects"),
    listRepoProjects: unexpected("listRepoProjects"),
    listProjectItems: unexpected("listProjectItems"),
    listIssueSubIssues: unexpected("listIssueSubIssues"),
    listIssueBlockedBy: unexpected("listIssueBlockedBy"),
    listIssueBlocking: unexpected("listIssueBlocking"),
    getOrgProject: unexpected("getOrgProject"),
    getUserProject: unexpected("getUserProject"),
    getRepo: unexpected("getRepo"),
    searchRepositories: unexpected("searchRepositories"),
    searchIssues: unexpected("searchIssues"),
    searchPullRequests: unexpected("searchPullRequests"),
    searchAccounts: unexpected("searchAccounts"),
    get lastRateLimit() {
      return undefined;
    },
  };
}

const parsed = { owner: "exadev", repo: "graphle" };

describe("loadRepoIssuesDocument", () => {
  it("assembles a repo node, one issue node per open issue, and contains edges", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoIssues: (): Promise<Page<GitHubIssue>> =>
        Promise.resolve({
          items: [issue(1, "Fix the thing"), issue(2, "Another bug")],
          endCursor: undefined,
          hasNextPage: false,
        }),
    };

    const result = await loadRepoIssuesDocument(parsed, DEFAULT_REPO_ISSUES_FILTERS, client, new AbortController().signal);

    expect(result.canonicalUrl).toBe("https://github.com/exadev/graphle/issues");
    expect(result.document.nodes).toHaveLength(3); // repo + 2 issues
    const repoNode = result.document.nodes.find((n) => n.type === "repo");
    expect(repoNode?.data.name).toBe("graphle");
    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes.map((n) => n.data.title)).toEqual(["Fix the thing", "Another bug"]);
    expect(result.document.edges).toHaveLength(2);
    expect(result.document.edges.every((e) => e.type === "contains")).toBe(true);
    expect(result.document.edges.every((e) => e.source === repoNode?.id)).toBe(true);
  });

  it("pages through every issue before assembling the document", async () => {
    let calls = 0;
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoIssues: (_owner, _name, cursor): Promise<Page<GitHubIssue>> => {
        calls += 1;
        if (cursor === undefined) {
          return Promise.resolve({
            items: [issue(1, "Page one")],
            endCursor: "cursor-2",
            hasNextPage: true,
          });
        }
        return Promise.resolve({
          items: [issue(2, "Page two")],
          endCursor: undefined,
          hasNextPage: false,
        });
      },
    };

    const result = await loadRepoIssuesDocument(parsed, DEFAULT_REPO_ISSUES_FILTERS, client, new AbortController().signal);

    expect(calls).toBe(2);
    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes.map((n) => n.data.title)).toEqual(["Page one", "Page two"]);
  });

  it("propagates a GitHubError from repo resolution without catching it", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.reject(new Error("not found")),
    };

    await expect(
      loadRepoIssuesDocument(
        { owner: "exadev", repo: "does-not-exist" },
        DEFAULT_REPO_ISSUES_FILTERS,
        client,
        new AbortController().signal,
      ),
    ).rejects.toThrow("not found");
  });

  it("passes the given filters through to the client and into the canonical URL", async () => {
    let receivedFilters: unknown;
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoIssues: (_owner, _name, _cursor, filters): Promise<Page<GitHubIssue>> => {
        receivedFilters = filters;
        return Promise.resolve({ items: [], endCursor: undefined, hasNextPage: false });
      },
    };
    const filters = {
      states: ["closed"] as const,
      sort: { field: "created" as const, direction: "asc" as const },
      labels: ["bug"],
    };

    const result = await loadRepoIssuesDocument(parsed, filters, client, new AbortController().signal);

    expect(receivedFilters).toEqual(filters);
    expect(result.canonicalUrl).toBe(
      "https://github.com/exadev/graphle/issues?state=closed&sort=created&direction=asc&labels=bug",
    );
  });
});

describe("loadRepoPullRequestsDocument", () => {
  it("assembles a repo node, one pull-request node per open PR, and contains edges", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoPullRequests: (): Promise<Page<GitHubPullRequest>> =>
        Promise.resolve({
          items: [pullRequest(3, "Add a feature"), pullRequest(4, "Fix a typo")],
          endCursor: undefined,
          hasNextPage: false,
        }),
    };

    const result = await loadRepoPullRequestsDocument(
      parsed,
      DEFAULT_REPO_PULL_REQUESTS_FILTERS,
      client,
      new AbortController().signal,
    );

    expect(result.canonicalUrl).toBe("https://github.com/exadev/graphle/pulls");
    expect(result.document.nodes).toHaveLength(3); // repo + 2 pull requests
    const repoNode = result.document.nodes.find((n) => n.type === "repo");
    const prNodes = result.document.nodes.filter((n) => n.type === "pullRequest");
    expect(prNodes.map((n) => n.data.title)).toEqual(["Add a feature", "Fix a typo"]);
    expect(result.document.edges).toHaveLength(2);
    expect(result.document.edges.every((e) => e.type === "contains")).toBe(true);
    expect(result.document.edges.every((e) => e.source === repoNode?.id)).toBe(true);
  });

  it("pages through every pull request before assembling the document", async () => {
    let calls = 0;
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoPullRequests: (_owner, _name, cursor): Promise<Page<GitHubPullRequest>> => {
        calls += 1;
        if (cursor === undefined) {
          return Promise.resolve({
            items: [pullRequest(1, "Page one")],
            endCursor: "cursor-2",
            hasNextPage: true,
          });
        }
        return Promise.resolve({
          items: [pullRequest(2, "Page two")],
          endCursor: undefined,
          hasNextPage: false,
        });
      },
    };

    const result = await loadRepoPullRequestsDocument(
      parsed,
      DEFAULT_REPO_PULL_REQUESTS_FILTERS,
      client,
      new AbortController().signal,
    );

    expect(calls).toBe(2);
    const prNodes = result.document.nodes.filter((n) => n.type === "pullRequest");
    expect(prNodes.map((n) => n.data.title)).toEqual(["Page one", "Page two"]);
  });

  it("propagates a GitHubError from repo resolution without catching it", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.reject(new Error("not found")),
    };

    await expect(
      loadRepoPullRequestsDocument(
        { owner: "exadev", repo: "does-not-exist" },
        DEFAULT_REPO_PULL_REQUESTS_FILTERS,
        client,
        new AbortController().signal,
      ),
    ).rejects.toThrow("not found");
  });

  it("passes the given filters through to the client, including a merged state", async () => {
    let receivedFilters: unknown;
    const client: GitHubClient = {
      ...unreachableClient(),
      getRepo: () => Promise.resolve(repo),
      listRepoPullRequests: (_owner, _name, _cursor, filters): Promise<Page<GitHubPullRequest>> => {
        receivedFilters = filters;
        return Promise.resolve({ items: [], endCursor: undefined, hasNextPage: false });
      },
    };
    const filters = {
      states: ["merged"] as const,
      sort: { field: "updated" as const, direction: "desc" as const },
      labels: [],
    };

    await loadRepoPullRequestsDocument(parsed, filters, client, new AbortController().signal);

    expect(receivedFilters).toEqual(filters);
  });
});
