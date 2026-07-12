import { describe, expect, it } from "vitest";

import { emptyDocument } from "../domain/empty";
import { applyDelta } from "../domain/merge";
import type { GraphNode } from "../schema";

import { expansionsForType } from "./expand";
import type { GitHubClient, Page } from "./contract";
import type { GitHubProjectItem } from "./schema";

const position = { x: 10, y: 20 };

function orgSource(): GraphNode {
  return {
    id: "org-1",
    type: "org",
    position,
    data: { login: "exadev" },
  };
}

/** Builds a client whose listOrgRepos returns a fixed canned page, all other
 *  methods throw so a test fails loudly if an unexpected call is made. */
function clientWithRepos(repos: Page<{
  name: string;
  owner: { login: string };
  url?: string;
  description: string | undefined;
  isArchived?: boolean;
}>): GitHubClient {
  return {
    viewer() {
      return Promise.reject(new Error("unexpected viewer call"));
    },
    listViewerOrgs() {
      return Promise.reject(new Error("unexpected listViewerOrgs call"));
    },
    listOrgRepos() {
      return Promise.resolve(repos);
    },
    listUserRepos() {
      return Promise.reject(new Error("unexpected listUserRepos call"));
    },
    listRepoIssues() {
      return Promise.reject(new Error("unexpected listRepoIssues call"));
    },
    listRepoPullRequests() {
      return Promise.reject(new Error("unexpected listRepoPullRequests call"));
    },
    listOrgProjects() {
      return Promise.reject(new Error("unexpected listOrgProjects call"));
    },
    listUserProjects() {
      return Promise.reject(new Error("unexpected listUserProjects call"));
    },
    listRepoProjects() {
      return Promise.reject(new Error("unexpected listRepoProjects call"));
    },
    listProjectItems() {
      return Promise.reject(new Error("unexpected listProjectItems call"));
    },
    listIssueSubIssues() {
      return Promise.reject(new Error("unexpected listIssueSubIssues call"));
    },
    listIssueBlockedBy() {
      return Promise.reject(new Error("unexpected listIssueBlockedBy call"));
    },
    listIssueBlocking() {
      return Promise.reject(new Error("unexpected listIssueBlocking call"));
    },
    getOrgProject() {
      return Promise.reject(new Error("unexpected getOrgProject call"));
    },
    getUserProject() {
      return Promise.reject(new Error("unexpected getUserProject call"));
    },
    getRepo() {
      return Promise.reject(new Error("unexpected getRepo call"));
    },
    searchRepositories() {
      return Promise.reject(new Error("unexpected searchRepositories call"));
    },
    searchIssues() {
      return Promise.reject(new Error("unexpected searchIssues call"));
    },
    searchPullRequests() {
      return Promise.reject(new Error("unexpected searchPullRequests call"));
    },
    searchAccounts() {
      return Promise.reject(new Error("unexpected searchAccounts call"));
    },
    get lastRateLimit() {
      return undefined;
    },
  };
}

describe("expansionsForType - org-repos", () => {
  it("builds repo nodes and owns edges from the source org", async () => {
    const source = orgSource();
    const client = clientWithRepos({
      items: [
        { name: "graphle", owner: { login: "exadev" }, description: undefined },
        { name: "shipwright", owner: { login: "exadev" }, description: undefined },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const expansion = expansionsForType("org").find((e) => e.id === "org-repos");
    if (expansion === undefined) throw new Error("org-repos expansion missing");

    const { delta, endCursor, hasNextPage } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(hasNextPage).toBe(false);
    expect(endCursor).toBeUndefined();

    const repoNames = delta.nodes.map((n) =>
      n.type === "repo" ? n.data.name : null,
    );
    expect(repoNames).toEqual(["graphle", "shipwright"]);
    // Every fetched node is parented to the expanded source node — the
    // org->repo subgraph nesting (see the module doc on `Expansion`).
    expect(delta.nodes.every((n) => n.parentId === source.id)).toBe(true);

    // Every edge runs source -> child with relation "owns".
    expect(delta.edges).toHaveLength(2);
    for (const edge of delta.edges) {
      expect(edge.source).toBe(source.id);
      expect(edge.type).toBe("owns");
      expect(delta.nodes.some((n) => n.id === edge.target)).toBe(true);
    }
  });

  it("produces a delta consumable by applyDelta", async () => {
    const source = orgSource();
    const client = clientWithRepos({
      items: [{ name: "graphle", owner: { login: "exadev" }, description: undefined }],
      endCursor: undefined,
      hasNextPage: false,
    });
    const expansion = expansionsForType("org")[0];
    if (expansion === undefined) throw new Error("org-repos expansion missing");

    const { delta } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    const doc = emptyDocument("test");
    doc.nodes.push(source);
    const { document: next, addedNodeIds } = applyDelta(doc, delta);

    expect(addedNodeIds).toHaveLength(1);
    expect(next.nodes.map((n) => n.id)).toContain(addedNodeIds[0]);
    expect(next.edges).toHaveLength(1);
  });
});

function repoSource(): GraphNode {
  return {
    id: "repo-1",
    type: "repo",
    position,
    data: { owner: "exadev", name: "graphle" },
  };
}

type PullRequestFixture = {
  number: number;
  title: string;
  state: "open" | "closed" | "merged";
  url: string;
  baseRefName: string;
  headRefName: string;
  isCrossRepository: boolean;
};

/** Builds a client whose listRepoPullRequests returns a fixed canned page,
 *  all other methods throw so a test fails loudly on an unexpected call. */
function clientWithPullRequests(page: Page<PullRequestFixture>): GitHubClient {
  const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected ${name} call`));
  return {
    viewer: unexpected("viewer"),
    listViewerOrgs: unexpected("listViewerOrgs"),
    listOrgRepos: unexpected("listOrgRepos"),
    listUserRepos: unexpected("listUserRepos"),
    listRepoIssues: unexpected("listRepoIssues"),
    listRepoPullRequests() {
      return Promise.resolve(page);
    },
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

function findPullRequestsExpansion() {
  const expansion = expansionsForType("repo").find((e) => e.id === "repo-pull-requests");
  if (expansion === undefined) throw new Error("repo-pull-requests expansion missing");
  return expansion;
}

describe("expansionsForType - repo-pull-requests", () => {
  it("builds pull request nodes and contains edges from the source repo", async () => {
    const source = repoSource();
    const client = clientWithPullRequests({
      items: [
        {
          number: 1,
          title: "Add feature",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/1",
          baseRefName: "main",
          headRefName: "feature-1",
          isCrossRepository: false,
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const { delta } = await findPullRequestsExpansion().run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(delta.nodes).toHaveLength(1);
    expect(delta.nodes[0]?.type).toBe("pullRequest");
    expect(delta.nodes[0]?.parentId).toBe(source.id);
    expect(delta.edges).toHaveLength(1);
    expect(delta.edges[0]?.type).toBe("contains");
    expect(delta.edges[0]?.source).toBe(source.id);
  });

  it("adds a stackedOn edge when one PR's baseRefName matches another's headRefName", async () => {
    const source = repoSource();
    const client = clientWithPullRequests({
      items: [
        {
          number: 1,
          title: "Base of the stack",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/1",
          baseRefName: "main",
          headRefName: "feature-base",
          isCrossRepository: false,
        },
        {
          number: 2,
          title: "Stacked on #1",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/2",
          baseRefName: "feature-base",
          headRefName: "feature-stacked",
          isCrossRepository: false,
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const { delta } = await findPullRequestsExpansion().run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    const baseNode = delta.nodes.find((n) => n.data.number === 1);
    const stackedNode = delta.nodes.find((n) => n.data.number === 2);
    if (baseNode === undefined || stackedNode === undefined) throw new Error("fixture: both PR nodes must exist");

    const stackEdges = delta.edges.filter((e) => e.type === "stackedOn");
    expect(stackEdges).toHaveLength(1);
    expect(stackEdges[0]?.source).toBe(stackedNode.id);
    expect(stackEdges[0]?.target).toBe(baseNode.id);
  });

  it("does not add a stackedOn edge for a PR based on the repo's default branch", async () => {
    const source = repoSource();
    const client = clientWithPullRequests({
      items: [
        {
          number: 1,
          title: "Ordinary PR",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/1",
          baseRefName: "main",
          headRefName: "feature-1",
          isCrossRepository: false,
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const { delta } = await findPullRequestsExpansion().run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(delta.edges.filter((e) => e.type === "stackedOn")).toHaveLength(0);
  });

  it("ignores a headRefName match from a cross-repository (fork) PR", async () => {
    const source = repoSource();
    const client = clientWithPullRequests({
      items: [
        {
          number: 1,
          title: "Fork PR that happens to share a branch name",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/1",
          baseRefName: "main",
          headRefName: "feature-base",
          isCrossRepository: true,
        },
        {
          number: 2,
          title: "Unrelated PR",
          state: "open",
          url: "https://github.com/exadev/graphle/pull/2",
          baseRefName: "feature-base",
          headRefName: "feature-2",
          isCrossRepository: false,
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const { delta } = await findPullRequestsExpansion().run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(delta.edges.filter((e) => e.type === "stackedOn")).toHaveLength(0);
  });
});

describe("expansionsForType - dispatch table", () => {
  it("offers repos and projects for org/repo, items for project, sub-issues/blocking for issue, nothing for freeform/unknown", () => {
    expect(expansionsForType("org").map((e) => e.id)).toEqual(["org-repos", "org-projects"]);
    expect(expansionsForType("repo").map((e) => e.id)).toEqual([
      "repo-issues",
      "repo-pull-requests",
      "repo-projects",
    ]);
    expect(expansionsForType("project").map((e) => e.id)).toEqual(["project-items"]);
    expect(expansionsForType("issue").map((e) => e.id)).toEqual([
      "issue-sub-issues",
      "issue-blocked-by",
      "issue-blocking",
    ]);
    expect(expansionsForType("freeform")).toEqual([]);
    expect(expansionsForType("custom-thing")).toEqual([]);
  });
});

describe("expansionsForType - project-items", () => {
  function projectSource(): GraphNode {
    return {
      id: "project-1",
      type: "project",
      position,
      data: {
        owner: "exadev",
        number: 1,
        title: "Roadmap",
        url: "https://github.com/orgs/exadev/projects/1",
        projectNodeId: "PVT_kwDOAA",
      },
    };
  }

  /** A client whose listProjectItems returns a fixed canned page; every other
   *  method throws so a test fails loudly on an unexpected call. */
  function clientWithItems(items: Page<GitHubProjectItem>): GitHubClient {
    return {
      viewer() {
        return Promise.reject(new Error("unexpected viewer call"));
      },
      listViewerOrgs() {
        return Promise.reject(new Error("unexpected listViewerOrgs call"));
      },
      listOrgRepos() {
        return Promise.reject(new Error("unexpected listOrgRepos call"));
      },
      listUserRepos() {
        return Promise.reject(new Error("unexpected listUserRepos call"));
      },
      listRepoIssues() {
        return Promise.reject(new Error("unexpected listRepoIssues call"));
      },
      listRepoPullRequests() {
        return Promise.reject(new Error("unexpected listRepoPullRequests call"));
      },
      listOrgProjects() {
        return Promise.reject(new Error("unexpected listOrgProjects call"));
      },
      listUserProjects() {
        return Promise.reject(new Error("unexpected listUserProjects call"));
      },
      listRepoProjects() {
        return Promise.reject(new Error("unexpected listRepoProjects call"));
      },
      listProjectItems() {
        return Promise.resolve(items);
      },
      listIssueSubIssues() {
        return Promise.reject(new Error("unexpected listIssueSubIssues call"));
      },
      listIssueBlockedBy() {
        return Promise.reject(new Error("unexpected listIssueBlockedBy call"));
      },
      listIssueBlocking() {
        return Promise.reject(new Error("unexpected listIssueBlocking call"));
      },
      getOrgProject() {
        return Promise.reject(new Error("unexpected getOrgProject call"));
      },
      getUserProject() {
        return Promise.reject(new Error("unexpected getUserProject call"));
      },
      getRepo() {
        return Promise.reject(new Error("unexpected getRepo call"));
      },
      searchRepositories() {
        return Promise.reject(new Error("unexpected searchRepositories call"));
      },
      searchIssues() {
        return Promise.reject(new Error("unexpected searchIssues call"));
      },
      searchPullRequests() {
        return Promise.reject(new Error("unexpected searchPullRequests call"));
      },
      searchAccounts() {
        return Promise.reject(new Error("unexpected searchAccounts call"));
      },
      get lastRateLimit() {
        return undefined;
      },
    };
  }

  it("materialises Issue items and skips DraftIssue items", async () => {
    const source = projectSource();
    const client = clientWithItems({
      items: [
        {
          __typename: "Issue",
          number: 42,
          title: "Fix the thing",
          state: "open",
          url: "https://github.com/exadev/graphle/issues/42",
          repository: { name: "graphle", owner: { login: "exadev" } },
        },
        { __typename: "DraftIssue", title: "A placeholder note" },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const expansion = expansionsForType("project")[0];
    if (expansion === undefined) throw new Error("project-items expansion missing");

    const { delta } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    // One issue node, no freeform (draft) nodes; one tracks edge.
    expect(delta.nodes).toHaveLength(1);
    expect(delta.nodes[0]?.type).toBe("issue");
    // A project tracks issues, it doesn't own them — no parentId claim.
    expect(delta.nodes[0]?.parentId).toBeUndefined();
    expect(delta.edges).toHaveLength(1);
    expect(delta.edges[0]?.type).toBe("tracks");
  });

  it("re-expanding the same items adds nothing (no draft-issue duplication)", async () => {
    const source = projectSource();
    const client = clientWithItems({
      items: [
        {
          __typename: "Issue",
          number: 42,
          title: "Fix the thing",
          state: "open",
          url: "https://github.com/exadev/graphle/issues/42",
          repository: { name: "graphle", owner: { login: "exadev" } },
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });
    const expansion = expansionsForType("project")[0];
    if (expansion === undefined) throw new Error("project-items expansion missing");

    const { delta } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    const doc = emptyDocument("test");
    doc.nodes.push(source);
    const first = applyDelta(doc, delta);
    const second = applyDelta(first.document, delta);
    expect(first.addedNodeIds).toHaveLength(1);
    expect(second.addedNodeIds).toHaveLength(0);
  });
});

function issueSource(): GraphNode {
  return {
    id: "issue-1",
    type: "issue",
    position,
    data: { owner: "exadev", repo: "graphle", number: 7, title: "Parent issue" },
  };
}

/** A client whose listIssueSubIssues returns a fixed canned page; every other
 *  method throws so a test fails loudly on an unexpected call. */
function clientWithSubIssues(page: Page<{ number: number; title: string; state: "open" | "closed"; url: string }>): GitHubClient {
  return {
    viewer() {
      return Promise.reject(new Error("unexpected viewer call"));
    },
    listViewerOrgs() {
      return Promise.reject(new Error("unexpected listViewerOrgs call"));
    },
    listOrgRepos() {
      return Promise.reject(new Error("unexpected listOrgRepos call"));
    },
    listUserRepos() {
      return Promise.reject(new Error("unexpected listUserRepos call"));
    },
    listRepoIssues() {
      return Promise.reject(new Error("unexpected listRepoIssues call"));
    },
    listRepoPullRequests() {
      return Promise.reject(new Error("unexpected listRepoPullRequests call"));
    },
    listOrgProjects() {
      return Promise.reject(new Error("unexpected listOrgProjects call"));
    },
    listUserProjects() {
      return Promise.reject(new Error("unexpected listUserProjects call"));
    },
    listRepoProjects() {
      return Promise.reject(new Error("unexpected listRepoProjects call"));
    },
    listProjectItems() {
      return Promise.reject(new Error("unexpected listProjectItems call"));
    },
    listIssueSubIssues() {
      return Promise.resolve(page);
    },
    listIssueBlockedBy() {
      return Promise.reject(new Error("unexpected listIssueBlockedBy call"));
    },
    listIssueBlocking() {
      return Promise.reject(new Error("unexpected listIssueBlocking call"));
    },
    getOrgProject() {
      return Promise.reject(new Error("unexpected getOrgProject call"));
    },
    getUserProject() {
      return Promise.reject(new Error("unexpected getUserProject call"));
    },
    getRepo() {
      return Promise.reject(new Error("unexpected getRepo call"));
    },
    searchRepositories() {
      return Promise.reject(new Error("unexpected searchRepositories call"));
    },
    searchIssues() {
      return Promise.reject(new Error("unexpected searchIssues call"));
    },
    searchPullRequests() {
      return Promise.reject(new Error("unexpected searchPullRequests call"));
    },
    searchAccounts() {
      return Promise.reject(new Error("unexpected searchAccounts call"));
    },
    get lastRateLimit() {
      return undefined;
    },
  };
}

type IssueWithRepoFixture = {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  repository: { name: string; owner: { login: string } };
};

/** A client whose listIssueBlockedBy returns a fixed canned page; every other
 *  method throws so a test fails loudly on an unexpected call. */
function clientWithBlockedBy(page: Page<IssueWithRepoFixture>): GitHubClient {
  return {
    viewer() {
      return Promise.reject(new Error("unexpected viewer call"));
    },
    listViewerOrgs() {
      return Promise.reject(new Error("unexpected listViewerOrgs call"));
    },
    listOrgRepos() {
      return Promise.reject(new Error("unexpected listOrgRepos call"));
    },
    listUserRepos() {
      return Promise.reject(new Error("unexpected listUserRepos call"));
    },
    listRepoIssues() {
      return Promise.reject(new Error("unexpected listRepoIssues call"));
    },
    listRepoPullRequests() {
      return Promise.reject(new Error("unexpected listRepoPullRequests call"));
    },
    listOrgProjects() {
      return Promise.reject(new Error("unexpected listOrgProjects call"));
    },
    listUserProjects() {
      return Promise.reject(new Error("unexpected listUserProjects call"));
    },
    listRepoProjects() {
      return Promise.reject(new Error("unexpected listRepoProjects call"));
    },
    listProjectItems() {
      return Promise.reject(new Error("unexpected listProjectItems call"));
    },
    listIssueSubIssues() {
      return Promise.reject(new Error("unexpected listIssueSubIssues call"));
    },
    listIssueBlockedBy() {
      return Promise.resolve(page);
    },
    listIssueBlocking() {
      return Promise.reject(new Error("unexpected listIssueBlocking call"));
    },
    getOrgProject() {
      return Promise.reject(new Error("unexpected getOrgProject call"));
    },
    getUserProject() {
      return Promise.reject(new Error("unexpected getUserProject call"));
    },
    getRepo() {
      return Promise.reject(new Error("unexpected getRepo call"));
    },
    searchRepositories() {
      return Promise.reject(new Error("unexpected searchRepositories call"));
    },
    searchIssues() {
      return Promise.reject(new Error("unexpected searchIssues call"));
    },
    searchPullRequests() {
      return Promise.reject(new Error("unexpected searchPullRequests call"));
    },
    searchAccounts() {
      return Promise.reject(new Error("unexpected searchAccounts call"));
    },
    get lastRateLimit() {
      return undefined;
    },
  };
}

/** A client whose listIssueBlocking returns a fixed canned page; every other
 *  method throws so a test fails loudly on an unexpected call. */
function clientWithBlocking(page: Page<IssueWithRepoFixture>): GitHubClient {
  return {
    viewer() {
      return Promise.reject(new Error("unexpected viewer call"));
    },
    listViewerOrgs() {
      return Promise.reject(new Error("unexpected listViewerOrgs call"));
    },
    listOrgRepos() {
      return Promise.reject(new Error("unexpected listOrgRepos call"));
    },
    listUserRepos() {
      return Promise.reject(new Error("unexpected listUserRepos call"));
    },
    listRepoIssues() {
      return Promise.reject(new Error("unexpected listRepoIssues call"));
    },
    listRepoPullRequests() {
      return Promise.reject(new Error("unexpected listRepoPullRequests call"));
    },
    listOrgProjects() {
      return Promise.reject(new Error("unexpected listOrgProjects call"));
    },
    listUserProjects() {
      return Promise.reject(new Error("unexpected listUserProjects call"));
    },
    listRepoProjects() {
      return Promise.reject(new Error("unexpected listRepoProjects call"));
    },
    listProjectItems() {
      return Promise.reject(new Error("unexpected listProjectItems call"));
    },
    listIssueSubIssues() {
      return Promise.reject(new Error("unexpected listIssueSubIssues call"));
    },
    listIssueBlockedBy() {
      return Promise.reject(new Error("unexpected listIssueBlockedBy call"));
    },
    listIssueBlocking() {
      return Promise.resolve(page);
    },
    getOrgProject() {
      return Promise.reject(new Error("unexpected getOrgProject call"));
    },
    getUserProject() {
      return Promise.reject(new Error("unexpected getUserProject call"));
    },
    getRepo() {
      return Promise.reject(new Error("unexpected getRepo call"));
    },
    searchRepositories() {
      return Promise.reject(new Error("unexpected searchRepositories call"));
    },
    searchIssues() {
      return Promise.reject(new Error("unexpected searchIssues call"));
    },
    searchPullRequests() {
      return Promise.reject(new Error("unexpected searchPullRequests call"));
    },
    searchAccounts() {
      return Promise.reject(new Error("unexpected searchAccounts call"));
    },
    get lastRateLimit() {
      return undefined;
    },
  };
}

describe("expansionsForType - issue-sub-issues", () => {
  it("builds issue nodes and contains edges from the source issue", async () => {
    const source = issueSource();
    const client = clientWithSubIssues({
      items: [
        { number: 8, title: "Sub-issue A", state: "open", url: "https://github.com/exadev/graphle/issues/8" },
        { number: 9, title: "Sub-issue B", state: "closed", url: "https://github.com/exadev/graphle/issues/9" },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const expansion = expansionsForType("issue").find((e) => e.id === "issue-sub-issues");
    if (expansion === undefined) throw new Error("issue-sub-issues expansion missing");

    const { delta, hasNextPage } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(hasNextPage).toBe(false);
    const titles = delta.nodes.map((n) => (n.type === "issue" ? n.data.title : null));
    expect(titles).toEqual(["Sub-issue A", "Sub-issue B"]);
    // Each sub-issue nests under the parent issue — three-level org->repo
    // ->issue->sub-issue subgraphs work by the same mechanism at every level.
    expect(delta.nodes.every((n) => n.parentId === source.id)).toBe(true);
    expect(delta.edges).toHaveLength(2);
    for (const edge of delta.edges) {
      expect(edge.source).toBe(source.id);
      expect(edge.type).toBe("contains");
    }
  });

  it("throws when the source node is not an issue", async () => {
    const source = orgSource();
    const client = clientWithSubIssues({ items: [], endCursor: undefined, hasNextPage: false });
    const expansion = expansionsForType("issue").find((e) => e.id === "issue-sub-issues");
    if (expansion === undefined) throw new Error("issue-sub-issues expansion missing");

    await expect(
      expansion.run(source, client, undefined, new AbortController().signal),
    ).rejects.toThrow("issue-sub-issues expansion requires an issue source node");
  });
});

describe("expansionsForType - issue-blocked-by", () => {
  it("builds issue nodes (each with its own repo) and blocks edges pointing at the source issue", async () => {
    const source = issueSource();
    const client = clientWithBlockedBy({
      items: [
        {
          number: 3,
          title: "Blocking issue",
          state: "open",
          url: "https://github.com/exadev/other-repo/issues/3",
          repository: { name: "other-repo", owner: { login: "exadev" } },
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const expansion = expansionsForType("issue").find((e) => e.id === "issue-blocked-by");
    if (expansion === undefined) throw new Error("issue-blocked-by expansion missing");

    const { delta, hasNextPage } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(hasNextPage).toBe(false);
    expect(delta.nodes).toHaveLength(1);
    expect(delta.nodes[0]?.data.repo).toBe("other-repo");
    // Blocking is not ownership — no subgraph nesting.
    expect(delta.nodes[0]?.parentId).toBeUndefined();
    expect(delta.edges).toHaveLength(1);
    // Edge points from the blocker to the source issue it blocks.
    expect(delta.edges[0]?.source).toBe(delta.nodes[0]?.id);
    expect(delta.edges[0]?.target).toBe(source.id);
    expect(delta.edges[0]?.type).toBe("blocks");
  });

  it("throws when the source node is not an issue", async () => {
    const source = orgSource();
    const client = clientWithBlockedBy({ items: [], endCursor: undefined, hasNextPage: false });
    const expansion = expansionsForType("issue").find((e) => e.id === "issue-blocked-by");
    if (expansion === undefined) throw new Error("issue-blocked-by expansion missing");

    await expect(
      expansion.run(source, client, undefined, new AbortController().signal),
    ).rejects.toThrow("issue-blocked-by expansion requires an issue source node");
  });
});

describe("expansionsForType - issue-blocking", () => {
  it("builds issue nodes (each with its own repo) and blocks edges pointing from the source issue", async () => {
    const source = issueSource();
    const client = clientWithBlocking({
      items: [
        {
          number: 4,
          title: "Blocked issue",
          state: "closed",
          url: "https://github.com/exadev/graphle/issues/4",
          repository: { name: "graphle", owner: { login: "exadev" } },
        },
      ],
      endCursor: undefined,
      hasNextPage: false,
    });

    const expansion = expansionsForType("issue").find((e) => e.id === "issue-blocking");
    if (expansion === undefined) throw new Error("issue-blocking expansion missing");

    const { delta, hasNextPage } = await expansion.run(
      source,
      client,
      undefined,
      new AbortController().signal,
    );

    expect(hasNextPage).toBe(false);
    expect(delta.nodes).toHaveLength(1);
    // Blocking is not ownership — no subgraph nesting.
    expect(delta.nodes[0]?.parentId).toBeUndefined();
    expect(delta.edges).toHaveLength(1);
    // Edge points from the source issue to the issue it blocks.
    expect(delta.edges[0]?.source).toBe(source.id);
    expect(delta.edges[0]?.target).toBe(delta.nodes[0]?.id);
    expect(delta.edges[0]?.type).toBe("blocks");
  });

  it("throws when the source node is not an issue", async () => {
    const source = orgSource();
    const client = clientWithBlocking({ items: [], endCursor: undefined, hasNextPage: false });
    const expansion = expansionsForType("issue").find((e) => e.id === "issue-blocking");
    if (expansion === undefined) throw new Error("issue-blocking expansion missing");

    await expect(
      expansion.run(source, client, undefined, new AbortController().signal),
    ).rejects.toThrow("issue-blocking expansion requires an issue source node");
  });
});
