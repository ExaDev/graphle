import { describe, expect, it } from "vitest";

import { nodeIdentityKey } from "../domain";
import { BUILT_IN_TYPES } from "../schema";
import {
  blocksEdge,
  containsEdge,
  issueToNode,
  issueWithRepoToNode,
  orgToNode,
  ownsEdge,
  projectToNode,
  pullRequestToNode,
  repoToNode,
  stackedOnEdge,
  tracksEdge,
} from "./materialise";
import type { GitHubIssue, GitHubIssueWithRepo, GitHubOrg, GitHubProject, GitHubPullRequest, GitHubRepo } from "./schema";

const position = { x: 0, y: 0 };

const org: GitHubOrg = { login: "ExaDev" };
const repo: GitHubRepo = { name: "graphle", owner: { login: "ExaDev" } };
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
  isCrossRepository: false,
};
const project: GitHubProject = { id: "PVT_1", number: 1, title: "Board", url: "https://github.com/orgs/ExaDev/projects/1" };

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
      { node: projectToNode("ExaDev", project, position), label: "project" },
    ];
    for (const { node, label } of cases) {
      expect(node.id, label).toBe(nodeIdentityKey(node, BUILT_IN_TYPES));
    }
  });

  it("lower-cases node ids, matching identity-key case-insensitivity", () => {
    const node = repoToNode({ name: "Graphle", owner: { login: "ExaDev" } }, position);
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
    const stacked = stackedOnEdge("pr-a", "pr-b");
    expect(blocks.id).not.toBe(stacked.id);
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
  });
});

describe("stackedOnEdge", () => {
  it("points from the dependent (stacked) PR to the PR it's based on", () => {
    const edge = stackedOnEdge("dependent-pr", "base-pr");
    expect(edge.source).toBe("dependent-pr");
    expect(edge.target).toBe("base-pr");
    expect(edge.type).toBe("stackedOn");
  });
});

describe("pullRequestToNode", () => {
  it("carries baseRefName and headRefName into node data", () => {
    const node = pullRequestToNode("ExaDev", "graphle", pullRequest, position);
    expect(node.data.baseRefName).toBe("main");
    expect(node.data.headRefName).toBe("feature");
  });
});
