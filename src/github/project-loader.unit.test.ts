import { describe, expect, it } from "vitest";

import { loadProjectDocument } from "./project-loader";
import type { GitHubClient, Page } from "./contract";
import type { GitHubProject, GitHubProjectItem } from "./schema";

const project: GitHubProject = {
  id: "PVT_1",
  number: 1,
  title: "Roadmap",
  url: "https://github.com/orgs/exadev/projects/1",
  closed: false,
};

function issueItem(number: number, title: string): Extract<GitHubProjectItem, { __typename: "Issue" }> {
  return {
    __typename: "Issue",
    number,
    title,
    state: "open",
    url: `https://github.com/exadev/graphle/issues/${String(number)}`,
    repository: { name: "graphle", owner: { login: "exadev" } },
  };
}

/** A client that fails loudly on any call the test doesn't expect. */
function unreachableClient(): GitHubClient {
  const unexpected = (name: string) => () => Promise.reject(new Error(`unexpected ${name} call`));
  return {
    viewer: unexpected("viewer"),
    listViewerOrgs: unexpected("listViewerOrgs"),
    listOrgRepos: unexpected("listOrgRepos"),
    listRepoIssues: unexpected("listRepoIssues"),
    listRepoPullRequests: unexpected("listRepoPullRequests"),
    listOrgProjects: unexpected("listOrgProjects"),
    listRepoProjects: unexpected("listRepoProjects"),
    listProjectItems: unexpected("listProjectItems"),
    listIssueSubIssues: unexpected("listIssueSubIssues"),
    getOrgProject: unexpected("getOrgProject"),
    getUserProject: unexpected("getUserProject"),
    getRepo: unexpected("getRepo"),
    get lastRateLimit() {
      return undefined;
    },
  };
}

describe("loadProjectDocument", () => {
  it("assembles a project node, one issue node per Issue item, and tracks edges", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getOrgProject: () => Promise.resolve(project),
      listProjectItems: (): Promise<Page<GitHubProjectItem>> =>
        Promise.resolve({
          items: [issueItem(1, "Fix the thing"), issueItem(2, "Another bug")],
          endCursor: undefined,
          hasNextPage: false,
        }),
    };

    const result = await loadProjectDocument(
      { ownerType: "org", login: "exadev", number: 1 },
      "",
      client,
      new AbortController().signal,
    );

    expect(result.canonicalUrl).toBe("https://github.com/orgs/exadev/projects/1");
    expect(result.document.name).toBe("Roadmap");
    expect(result.document.nodes).toHaveLength(3); // project + 2 issues
    const projectNode = result.document.nodes.find((n) => n.type === "project");
    expect(projectNode?.data.number).toBe(1);
    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes.map((n) => n.data.title)).toEqual(["Fix the thing", "Another bug"]);
    expect(result.document.edges).toHaveLength(2);
    expect(result.document.edges.every((e) => e.type === "tracks")).toBe(true);
    expect(result.document.edges.every((e) => e.source === projectNode?.id)).toBe(true);
  });

  it("skips DraftIssue items, matching the interactive project-items expansion", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getOrgProject: () => Promise.resolve(project),
      listProjectItems: (): Promise<Page<GitHubProjectItem>> =>
        Promise.resolve({
          items: [issueItem(1, "Fix the thing"), { __typename: "DraftIssue", title: "Placeholder" }],
          endCursor: undefined,
          hasNextPage: false,
        }),
    };

    const result = await loadProjectDocument(
      { ownerType: "org", login: "exadev", number: 1 },
      "",
      client,
      new AbortController().signal,
    );

    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes).toHaveLength(1);
    expect(issueNodes[0]?.data.title).toBe("Fix the thing");
  });

  it("pages through every item before assembling the document", async () => {
    let calls = 0;
    const client: GitHubClient = {
      ...unreachableClient(),
      getOrgProject: () => Promise.resolve(project),
      listProjectItems: (_id, cursor): Promise<Page<GitHubProjectItem>> => {
        calls += 1;
        if (cursor === undefined) {
          return Promise.resolve({
            items: [issueItem(1, "Page one")],
            endCursor: "cursor-2",
            hasNextPage: true,
          });
        }
        return Promise.resolve({
          items: [issueItem(2, "Page two")],
          endCursor: undefined,
          hasNextPage: false,
        });
      },
    };

    const result = await loadProjectDocument(
      { ownerType: "org", login: "exadev", number: 1 },
      "",
      client,
      new AbortController().signal,
    );

    expect(calls).toBe(2);
    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes.map((n) => n.data.title)).toEqual(["Page one", "Page two"]);
  });

  it("calls getUserProject for a user-owned project, not getOrgProject", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getUserProject: () => Promise.resolve(project),
      listProjectItems: (): Promise<Page<GitHubProjectItem>> =>
        Promise.resolve({ items: [], endCursor: undefined, hasNextPage: false }),
    };

    const result = await loadProjectDocument(
      { ownerType: "user", login: "octocat", number: 1 },
      "",
      client,
      new AbortController().signal,
    );

    expect(result.document.nodes).toHaveLength(1); // project node only
  });

  it("propagates a GitHubError from project resolution without catching it", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getOrgProject: () => Promise.reject(new Error("not found")),
    };

    await expect(
      loadProjectDocument(
        { ownerType: "org", login: "exadev", number: 999 },
        "",
        client,
        new AbortController().signal,
      ),
    ).rejects.toThrow("not found");
  });

  it("filters items by a case-insensitive title substring match", async () => {
    const client: GitHubClient = {
      ...unreachableClient(),
      getOrgProject: () => Promise.resolve(project),
      listProjectItems: (): Promise<Page<GitHubProjectItem>> =>
        Promise.resolve({
          items: [issueItem(1, "Fix the thing"), issueItem(2, "Another bug")],
          endCursor: undefined,
          hasNextPage: false,
        }),
    };

    const result = await loadProjectDocument(
      { ownerType: "org", login: "exadev", number: 1 },
      "BUG",
      client,
      new AbortController().signal,
    );

    const issueNodes = result.document.nodes.filter((n) => n.type === "issue");
    expect(issueNodes.map((n) => n.data.title)).toEqual(["Another bug"]);
    expect(result.canonicalUrl).toBe("https://github.com/orgs/exadev/projects/1?filterQuery=BUG");
  });
});
