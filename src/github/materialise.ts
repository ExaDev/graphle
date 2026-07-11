import type {
  GraphEdge,
  GraphNode,
  Position,
} from "../schema";
import type {
  GitHubIssue,
  GitHubOrg,
  GitHubProject,
  GitHubProjectItem,
  GitHubPullRequest,
  GitHubRepo,
} from "./schema";

/**
 * Pure mappers that turn parsed GitHub entities into graph {@link GraphNode}s
 * and {@link GraphEdge}s. Every node and edge gets a fresh {@link crypto.randomUUID}
 * so each materialisation is independent; the merge layer is responsible for
 * collapsing nodes that represent the same external entity.
 *
 * Optional fields are spread conditionally rather than set to `undefined`, to
 * respect `exactOptionalPropertyTypes` — a node data field marked optional must
 * not carry an explicit `undefined`.
 */

/** The `Issue` arm of {@link GitHubProjectItem}, narrowed from the discriminator. */
type ProjectIssueItem = Extract<GitHubProjectItem, { __typename: "Issue" }>;

export function orgToNode(org: GitHubOrg, position: Position): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "org",
    position,
    data: {
      login: org.login,
      ...(org.name !== undefined ? { name: org.name } : {}),
      ...(org.url !== undefined ? { url: org.url } : {}),
      ...(org.avatarUrl !== undefined ? { avatarUrl: org.avatarUrl } : {}),
    },
  };
}

export function repoToNode(repo: GitHubRepo, position: Position): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "repo",
    position,
    data: {
      owner: repo.owner.login,
      name: repo.name,
      ...(repo.url !== undefined ? { url: repo.url } : {}),
      ...(repo.description !== undefined ? { description: repo.description } : {}),
      ...(repo.isArchived !== undefined ? { archived: repo.isArchived } : {}),
    },
  };
}

export function issueToNode(
  repoOwner: string,
  repoName: string,
  issue: GitHubIssue,
  position: Position,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "issue",
    position,
    data: {
      owner: repoOwner,
      repo: repoName,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.url,
    },
  };
}

export function pullRequestToNode(
  repoOwner: string,
  repoName: string,
  pullRequest: GitHubPullRequest,
  position: Position,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "pullRequest",
    position,
    data: {
      owner: repoOwner,
      repo: repoName,
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      url: pullRequest.url,
    },
  };
}

/**
 * Materialises a project item's `Issue` content. Unlike {@link issueToNode} the
 * owner and repo come from the item's nested `repository`, and `state` is
 * optional in this payload, so it is spread conditionally.
 */
export function projectIssueItemToNode(
  content: ProjectIssueItem,
  position: Position,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "issue",
    position,
    data: {
      owner: content.repository.owner.login,
      repo: content.repository.name,
      number: content.number,
      title: content.title,
      ...(content.state !== undefined ? { state: content.state } : {}),
      url: content.url,
    },
  };
}

export function projectToNode(
  ownerLogin: string,
  project: GitHubProject,
  position: Position,
): GraphNode {
  return {
    id: crypto.randomUUID(),
    type: "project",
    position,
    data: {
      owner: ownerLogin,
      number: project.number,
      title: project.title,
      url: project.url,
      projectNodeId: project.id,
    },
  };
}

// --- Edge builders ----------------------------------------------------------

export function ownsEdge(parentId: string, childId: string): GraphEdge {
  return {
    id: crypto.randomUUID(),
    source: parentId,
    target: childId,
    type: "owns",
    data: {},
  };
}

export function containsEdge(parentId: string, childId: string): GraphEdge {
  return {
    id: crypto.randomUUID(),
    source: parentId,
    target: childId,
    type: "contains",
    data: {},
  };
}

export function tracksEdge(projectId: string, issueId: string): GraphEdge {
  return {
    id: crypto.randomUUID(),
    source: projectId,
    target: issueId,
    type: "tracks",
    data: {},
  };
}

/**
 * Assembles a {@link GraphDelta} from the nodes and edges an expansion produced.
 * Kept as a named helper so expansion sites build deltas uniformly and the
 * shape stays in one place.
 */
export function buildDelta(
  nodes: GraphNode[],
  edges: GraphEdge[],
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return { nodes, edges };
}
