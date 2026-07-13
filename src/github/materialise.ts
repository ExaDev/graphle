import type {
  GraphEdge,
  GraphNode,
  Position,
} from "../schema";
import type {
  GitHubIssue,
  GitHubIssueWithRepo,
  GitHubOrg,
  GitHubProject,
  GitHubProjectItem,
  GitHubPullRequest,
  GitHubPullRequestWithRepo,
  GitHubRepo,
} from "./schema";

/**
 * Pure mappers that turn parsed GitHub entities into graph {@link GraphNode}s
 * and {@link GraphEdge}s. Every node and edge gets a deterministic id derived
 * from its GitHub identity via {@link githubNodeId}/{@link githubEdgeId}, so
 * two independent fetches of the same entity or relationship produce the
 * literally-identical id up front. This is purely additive, not a migration:
 * `src/domain/merge.ts`'s `applyDelta` identity-key dedup remains unchanged
 * and still does the real work of reconciling a freshly-fetched node against
 * one already in the document from before this scheme existed (still
 * carrying its original random UUID) — old and new ids coexist in the same
 * document with no compatibility shim required.
 *
 * Optional fields are spread conditionally rather than set to `undefined`, to
 * respect `exactOptionalPropertyTypes` — a node data field marked optional must
 * not carry an explicit `undefined`.
 */

/** The `Issue` arm of {@link GitHubProjectItem}, narrowed from the discriminator. */
type ProjectIssueItem = Extract<GitHubProjectItem, { __typename: "Issue" }>;

/**
 * Mirrors `nodeIdentityKey`'s format (`src/domain/identity.ts`) exactly, so a
 * freshly materialised node's id already equals what identity-based dedup
 * would compute for it — `parts` must be supplied in the same order as that
 * type's `identityFields` (`src/schema/built-in-types.ts`).
 */
function githubNodeId(typeName: string, parts: ReadonlyArray<string | number>): string {
  return `${typeName}:${parts.join("/")}`.toLowerCase();
}

/**
 * Mirrors `edgeTripleKey`'s format (`src/domain/merge.ts`); unlike node ids,
 * edge type is not lower-cased here, matching that function's existing
 * case-sensitive comparison.
 */
function githubEdgeId(type: string, source: string, target: string): string {
  return `${type}:${source}->${target}`;
}

export function orgToNode(org: GitHubOrg, position: Position): GraphNode {
  return {
    id: githubNodeId("org", [org.login]),
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
    id: githubNodeId("repo", [repo.owner.login, repo.name]),
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
    id: githubNodeId("issue", [repoOwner, repoName, issue.number]),
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

/**
 * Materialises an issue reached via a blocking relationship, where owner/repo
 * come from the issue's own `repository` rather than a caller-supplied pair —
 * unlike {@link issueToNode}, a blocking relationship can cross repositories,
 * so the source issue's owner/repo can't be assumed. Mirrors
 * {@link projectIssueItemToNode}'s same reasoning for project items.
 */
export function issueWithRepoToNode(
  issue: GitHubIssueWithRepo,
  position: Position,
): GraphNode {
  return {
    id: githubNodeId("issue", [issue.repository.owner.login, issue.repository.name, issue.number]),
    type: "issue",
    position,
    data: {
      owner: issue.repository.owner.login,
      repo: issue.repository.name,
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
    id: githubNodeId("pullRequest", [repoOwner, repoName, pullRequest.number]),
    type: "pullRequest",
    position,
    data: {
      owner: repoOwner,
      repo: repoName,
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      url: pullRequest.url,
      baseRefName: pullRequest.baseRefName,
      headRefName: pullRequest.headRefName,
    },
  };
}

/**
 * Materialises a pull request reached via search, where owner/repo come from
 * the PR's own `repository` rather than a caller-supplied pair — mirrors
 * {@link issueWithRepoToNode}'s reasoning: search results are never scoped to
 * one repo, so it can't be assumed from context.
 */
export function pullRequestWithRepoToNode(
  pullRequest: GitHubPullRequestWithRepo,
  position: Position,
): GraphNode {
  return {
    id: githubNodeId("pullRequest", [
      pullRequest.repository.owner.login,
      pullRequest.repository.name,
      pullRequest.number,
    ]),
    type: "pullRequest",
    position,
    data: {
      owner: pullRequest.repository.owner.login,
      repo: pullRequest.repository.name,
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      url: pullRequest.url,
      baseRefName: pullRequest.baseRefName,
      headRefName: pullRequest.headRefName,
    },
  };
}

/**
 * Materialises a repo branch, scoped to the repo it actually lives in — a
 * pull request's base branch is always in the repo the PR was opened
 * against, but its head branch may be in a fork, so callers pass whichever
 * owner/repo the branch was resolved to (see `expand.ts`'s `repoPullRequests`).
 */
export function branchToNode(
  owner: string,
  repo: string,
  branchName: string,
  position: Position,
): GraphNode {
  return {
    id: githubNodeId("branch", [owner, repo, branchName]),
    type: "branch",
    position,
    data: { owner, repo, branchName },
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
    id: githubNodeId("issue", [content.repository.owner.login, content.repository.name, content.number]),
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
    id: githubNodeId("project", [ownerLogin, project.number]),
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
    id: githubEdgeId("owns", parentId, childId),
    source: parentId,
    target: childId,
    type: "owns",
    data: {},
  };
}

export function containsEdge(parentId: string, childId: string): GraphEdge {
  return {
    id: githubEdgeId("contains", parentId, childId),
    source: parentId,
    target: childId,
    type: "contains",
    data: {},
  };
}

export function tracksEdge(projectId: string, issueId: string): GraphEdge {
  return {
    id: githubEdgeId("tracks", projectId, issueId),
    source: projectId,
    target: issueId,
    type: "tracks",
    data: {},
  };
}

/**
 * `source` is always the blocking issue and `target` the blocked one, so the
 * arrow reads "blocker -> blocked" regardless of whether it was discovered
 * via the source issue's `blockedBy` or `blocking` connection.
 */
export function blocksEdge(blockingIssueId: string, blockedIssueId: string): GraphEdge {
  return {
    id: githubEdgeId("blocks", blockingIssueId, blockedIssueId),
    source: blockingIssueId,
    target: blockedIssueId,
    type: "blocks",
    data: {},
  };
}

export function headBranchEdge(pullRequestId: string, branchId: string): GraphEdge {
  return {
    id: githubEdgeId("headBranch", pullRequestId, branchId),
    source: pullRequestId,
    target: branchId,
    type: "headBranch",
    data: {},
  };
}

export function baseBranchEdge(pullRequestId: string, branchId: string): GraphEdge {
  return {
    id: githubEdgeId("baseBranch", pullRequestId, branchId),
    source: pullRequestId,
    target: branchId,
    type: "baseBranch",
    data: {},
  };
}

/**
 * Materialises one pull request's base and head branch as nodes plus the
 * `baseBranch`/`headBranch` edges linking `prNode` to them. `branchNodes` is
 * caller-owned and caller-supplied — a `repo-pull-requests` expansion fetching
 * many PRs shares one `Map` across the whole page so two PRs referencing the
 * same branch (e.g. one PR's base equals another's head) converge on a single
 * node rather than duplicating it; a single-PR expansion (`pull-request-branches`)
 * passes a fresh `Map` since there is only ever one PR to dedupe against. Only
 * *newly* created branch nodes are returned in `nodes` — a branch already
 * present in `branchNodes` from an earlier call in the same loop is reused
 * (via its id) without being re-added.
 *
 * The base branch always belongs to the repo being expanded (`repoOwner`/
 * `repoName`), so a new base branch is always parented under `parentId` with
 * a `contains` edge. The head branch may live in a fork (`headRepository`);
 * `undefined` means the fork has since been deleted, in which case no head
 * branch node/edge is created at all. A fork's head branch is still
 * materialised as a node (so it's visible on the canvas) but is deliberately
 * left unparented, with no `contains` edge from `parentId` — it isn't
 * genuinely owned by the repo/PR being expanded.
 */
export function pullRequestBranchDelta(
  pullRequest: GitHubPullRequest,
  prNode: GraphNode,
  repoOwner: string,
  repoName: string,
  parentId: string,
  branchNodes: Map<string, GraphNode>,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  function branchNodeFor(
    branchOwner: string,
    branchRepo: string,
    branchName: string,
    near: Position,
  ): { node: GraphNode; isNew: boolean } {
    const candidate = branchToNode(branchOwner, branchRepo, branchName, near);
    const existing = branchNodes.get(candidate.id);
    if (existing !== undefined) return { node: existing, isNew: false };
    branchNodes.set(candidate.id, candidate);
    return { node: candidate, isNew: true };
  }

  const { node: baseBranch, isNew: baseIsNew } = branchNodeFor(
    repoOwner,
    repoName,
    pullRequest.baseRefName,
    prNode.position,
  );
  edges.push(baseBranchEdge(prNode.id, baseBranch.id));
  if (baseIsNew) {
    baseBranch.parentId = parentId;
    nodes.push(baseBranch);
    edges.push(containsEdge(parentId, baseBranch.id));
  }

  if (pullRequest.headRepository !== undefined) {
    const { node: headBranch, isNew: headIsNew } = branchNodeFor(
      pullRequest.headRepository.owner.login,
      pullRequest.headRepository.name,
      pullRequest.headRefName,
      prNode.position,
    );
    edges.push(headBranchEdge(prNode.id, headBranch.id));
    if (headIsNew) {
      nodes.push(headBranch);
      const headBranchIsInSourceRepo =
        pullRequest.headRepository.owner.login === repoOwner && pullRequest.headRepository.name === repoName;
      if (headBranchIsInSourceRepo) {
        headBranch.parentId = parentId;
        edges.push(containsEdge(parentId, headBranch.id));
      }
    }
  }

  return { nodes, edges };
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
