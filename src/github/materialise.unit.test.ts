import { describe, expect, it } from "vitest";

import { nodeIdentityKey } from "../domain";
import { BUILT_IN_TYPES } from "../schema";
import {
  baseBranchEdge,
  blocksEdge,
  branchToNode,
  containsEdge,
  headBranchEdge,
  issueToNode,
  issueWithRepoToNode,
  orgToNode,
  ownsEdge,
  projectToNode,
  pullRequestBranchDelta,
  pullRequestToNode,
  pullRequestWithRepoToNode,
  repoToNode,
  tracksEdge,
} from "./materialise";
import type {
  GitHubIssue,
  GitHubIssueWithRepo,
  GitHubOrg,
  GitHubProject,
  GitHubPullRequest,
  GitHubPullRequestWithRepo,
  GitHubRepo,
} from "./schema";
import type { GraphNode } from "../schema";

const position = { x: 0, y: 0 };

const org: GitHubOrg = { login: "ExaDev", name: undefined };
const repo: GitHubRepo = { name: "graphle", owner: { login: "ExaDev" }, description: undefined };
const issue: GitHubIssue = { number: 1, title: "An issue", state: "open", url: "https://github.com/ExaDev/graphle/issues/1" };
const issueWithRepo: GitHubIssueWithRepo = {
  ...issue,
  repository: { name: "graphle", owner: { login: "ExaDev" } },
};
const pullRequest: GitHubPullRequest = {
  number: 4,
  title: "A pull request",
  state: "open",
  url: "https://github.com/ExaDev/graphle/pull/4",
  baseRefName: "main",
  headRefName: "feature",
  headRepository: { name: "graphle", owner: { login: "ExaDev" } },
};
const project: GitHubProject = { id: "PVT_1", number: 1, title: "Board", url: "https://github.com/orgs/ExaDev/projects/1" };
const pullRequestWithRepo: GitHubPullRequestWithRepo = {
  ...pullRequest,
  repository: { name: "graphle", owner: { login: "ExaDev" } },
};

describe("materialise - deterministic node ids", () => {
  it("gives the same GitHub entity the same id across two independent calls", () => {
    const first = pullRequestToNode("ExaDev", "graphle", pullRequest, position);
    const second = pullRequestToNode("ExaDev", "graphle", pullRequest, { x: 99, y: 99 });
    expect(first.id).toBe(second.id);
  });

  it("gives different entities of the same type different ids", () => {
    const a = pullRequestToNode("ExaDev", "graphle", pullRequest, position);
    const b = pullRequestToNode("ExaDev", "graphle", { ...pullRequest, number: 5 }, position);
    expect(a.id).not.toBe(b.id);
  });

  it("matches nodeIdentityKey's format for every GitHub-sourced node type", () => {
    const cases: Array<{ node: ReturnType<typeof orgToNode>; label: string }> = [
      { node: orgToNode(org, position), label: "org" },
      { node: repoToNode(repo, position), label: "repo" },
      { node: issueToNode("ExaDev", "graphle", issue, position), label: "issue (same-repo)" },
      { node: issueWithRepoToNode(issueWithRepo, position), label: "issue (with-repo)" },
      { node: pullRequestToNode("ExaDev", "graphle", pullRequest, position), label: "pullRequest" },
      { node: pullRequestWithRepoToNode(pullRequestWithRepo, position), label: "pullRequest (with-repo)" },
      { node: projectToNode("ExaDev", project, position), label: "project" },
      { node: branchToNode("ExaDev", "graphle", "main", position), label: "branch" },
    ];
    for (const { node, label } of cases) {
      expect(node.id, label).toBe(nodeIdentityKey(node, BUILT_IN_TYPES));
    }
  });

  it("lower-cases node ids, matching identity-key case-insensitivity", () => {
    const node = repoToNode(
      { name: "Graphle", owner: { login: "ExaDev" }, description: undefined },
      position,
    );
    expect(node.id).toBe(node.id.toLowerCase());
  });
});

describe("materialise - deterministic edge ids", () => {
  it("gives the same (source, target, type) the same id across two independent calls", () => {
    const first = blocksEdge("issue-a", "issue-b");
    const second = blocksEdge("issue-a", "issue-b");
    expect(first.id).toBe(second.id);
  });

  it("gives different edge types between the same two nodes different ids", () => {
    const blocks = blocksEdge("pr-a", "pr-b");
    const head = headBranchEdge("pr-a", "pr-b");
    expect(blocks.id).not.toBe(head.id);
  });

  it("gives opposite directions between the same two nodes different ids", () => {
    const forward = containsEdge("repo-1", "pr-1");
    const backward = containsEdge("pr-1", "repo-1");
    expect(forward.id).not.toBe(backward.id);
  });

  it("every edge builder returns the fixed type and role assignment", () => {
    expect(ownsEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "owns" });
    expect(containsEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "contains" });
    expect(tracksEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "tracks" });
    expect(blocksEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "blocks" });
    expect(headBranchEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "headBranch" });
    expect(baseBranchEdge("a", "b")).toMatchObject({ source: "a", target: "b", type: "baseBranch" });
  });
});

describe("branchToNode", () => {
  it("gives the same branch the same id across two independent calls", () => {
    const first = branchToNode("ExaDev", "graphle", "main", position);
    const second = branchToNode("ExaDev", "graphle", "main", { x: 99, y: 99 });
    expect(first.id).toBe(second.id);
  });

  it("gives branches of the same name in different repos different ids", () => {
    const a = branchToNode("ExaDev", "graphle", "main", position);
    const b = branchToNode("SomeoneElse", "graphle-fork", "main", position);
    expect(a.id).not.toBe(b.id);
  });

  it("carries owner/repo/branchName into node data", () => {
    const node = branchToNode("ExaDev", "graphle", "main", position);
    expect(node.data).toEqual({ owner: "ExaDev", repo: "graphle", branchName: "main" });
  });
});

describe("headBranchEdge / baseBranchEdge", () => {
  it("both point from the pull request to the branch", () => {
    const head = headBranchEdge("pr-1", "branch-1");
    expect(head.source).toBe("pr-1");
    expect(head.target).toBe("branch-1");
    expect(head.type).toBe("headBranch");

    const base = baseBranchEdge("pr-1", "branch-2");
    expect(base.source).toBe("pr-1");
    expect(base.target).toBe("branch-2");
    expect(base.type).toBe("baseBranch");
  });
});

describe("pullRequestToNode", () => {
  it("carries baseRefName and headRefName into node data", () => {
    const node = pullRequestToNode("ExaDev", "graphle", pullRequest, position);
    expect(node.data.baseRefName).toBe("main");
    expect(node.data.headRefName).toBe("feature");
  });
});

describe("pullRequestWithRepoToNode", () => {
  it("reads owner/repo from the pull request's own repository, not a caller-supplied pair", () => {
    const node = pullRequestWithRepoToNode(pullRequestWithRepo, position);
    expect(node.data.owner).toBe("ExaDev");
    expect(node.data.repo).toBe("graphle");
    expect(node.data.number).toBe(4);
  });

  it("gives the same id as pullRequestToNode for the same owner/repo/number", () => {
    const a = pullRequestToNode("ExaDev", "graphle", pullRequest, position);
    const b = pullRequestWithRepoToNode(pullRequestWithRepo, position);
    expect(a.id).toBe(b.id);
  });
});

describe("pullRequestBranchDelta", () => {
  const prNode: GraphNode = pullRequestToNode("ExaDev", "graphle", pullRequest, position);

  it("materialises both base and head branch, parented under parentId, with edges from the PR", () => {
    const { nodes, edges } = pullRequestBranchDelta(
      pullRequest,
      prNode,
      "ExaDev",
      "graphle",
      "repo-1",
      new Map(),
    );

    expect(nodes).toHaveLength(2);
    const baseBranch = nodes.find((n) => n.data.branchName === "main");
    const headBranch = nodes.find((n) => n.data.branchName === "feature");
    if (baseBranch === undefined || headBranch === undefined) {
      throw new Error("fixture: both branch nodes must exist");
    }
    expect(baseBranch.parentId).toBe("repo-1");
    expect(headBranch.parentId).toBe("repo-1");
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "baseBranch", source: prNode.id, target: baseBranch.id }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "headBranch", source: prNode.id, target: headBranch.id }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "contains", source: "repo-1", target: baseBranch.id }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "contains", source: "repo-1", target: headBranch.id }),
    );
  });

  it("materialises a fork's head branch as a node, but leaves it unparented with no contains edge", () => {
    const forkPullRequest: GitHubPullRequest = {
      ...pullRequest,
      headRepository: { name: "graphle", owner: { login: "someone-else" } },
    };
    const { nodes, edges } = pullRequestBranchDelta(
      forkPullRequest,
      prNode,
      "ExaDev",
      "graphle",
      "repo-1",
      new Map(),
    );

    const headBranch = nodes.find((n) => n.data.owner === "someone-else");
    if (headBranch === undefined) throw new Error("fixture: fork head branch node must exist");
    expect(headBranch.parentId).toBeUndefined();
    expect(edges.some((e) => e.type === "contains" && e.target === headBranch.id)).toBe(false);
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "headBranch", source: prNode.id, target: headBranch.id }),
    );
  });

  it("creates no head branch node or edge when the PR's fork has been deleted", () => {
    const deletedForkPullRequest: GitHubPullRequest = { ...pullRequest, headRepository: undefined };
    const { nodes, edges } = pullRequestBranchDelta(
      deletedForkPullRequest,
      prNode,
      "ExaDev",
      "graphle",
      "repo-1",
      new Map(),
    );

    expect(nodes.map((n) => n.data.branchName)).toEqual(["main"]);
    expect(edges.some((e) => e.type === "headBranch")).toBe(false);
  });

  it("reuses an existing branch node from a caller-supplied Map instead of duplicating it", () => {
    const branchNodes = new Map<string, GraphNode>();
    const existingMain = branchToNode("ExaDev", "graphle", "main", position);
    branchNodes.set(existingMain.id, existingMain);

    const { nodes, edges } = pullRequestBranchDelta(
      pullRequest,
      prNode,
      "ExaDev",
      "graphle",
      "repo-1",
      branchNodes,
    );

    // The base branch ("main") was already in the Map, so it's not returned
    // again as a new node — only the head branch ("feature") is.
    expect(nodes.map((n) => n.data.branchName)).toEqual(["feature"]);
    expect(edges).toContainEqual(
      expect.objectContaining({ type: "baseBranch", source: prNode.id, target: existingMain.id }),
    );
  });
});
