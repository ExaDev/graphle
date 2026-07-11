/**
 * Loads an entire GitHub repo issues list or pull-requests list — resolved
 * from a parsed {@link ParsedRepoListUrl} — into a fresh {@link GraphDocument}:
 * a repo node plus one issue (or pull request) node per open item, connected
 * by `contains` edges. This is the whole-list counterpart to the existing
 * interactive "repo-issues"/"repo-pull-requests" expansions in `./expand`
 * (which add one page of items to an *existing* repo node already on the
 * canvas, one UI click per page); these loaders instead page through every
 * item internally before returning, since they are producing a whole graph in
 * one shot, not incrementally expanding a node the caller already has.
 *
 * Reuses the existing pure materialisers (`repoToNode`, `issueToNode`,
 * `pullRequestToNode`, `containsEdge`, `buildDelta`) unchanged — no new
 * node/edge shapes are introduced.
 *
 * A large repo means many sequential GraphQL round trips (one per `PAGE_SIZE`
 * -item page) and a real chunk of the token's rate budget; there is no
 * progress UI for this in v1.
 */
import { applyDelta, emptyDocument, placeAround } from "../domain";
import type { GraphDocument, GraphEdge, GraphNode, Position } from "../schema";

import type { GitHubClient } from "./contract";
import { buildDelta, containsEdge, issueToNode, pullRequestToNode, repoToNode } from "./materialise";
import {
  canonicalRepoIssuesUrl,
  canonicalRepoPullRequestsUrl,
  type ParsedRepoListUrl,
} from "./repo-list-url";
import type { GitHubIssue, GitHubPullRequest } from "./schema";

/** Origin position for the repo node; issue/pull-request nodes are placed
 *  around it. */
const REPO_POSITION: Position = { x: 0, y: 0 };

/** Page through every open issue in a repo, following `endCursor` until
 *  GitHub reports no next page. */
async function loadAllRepoIssues(
  client: GitHubClient,
  owner: string,
  name: string,
  signal: AbortSignal,
): Promise<GitHubIssue[]> {
  const issues: GitHubIssue[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await client.listRepoIssues(owner, name, cursor, signal);
    issues.push(...page.items);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  return issues;
}

/** Page through every open pull request in a repo, following `endCursor`
 *  until GitHub reports no next page. */
async function loadAllRepoPullRequests(
  client: GitHubClient,
  owner: string,
  name: string,
  signal: AbortSignal,
): Promise<GitHubPullRequest[]> {
  const pullRequests: GitHubPullRequest[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await client.listRepoPullRequests(owner, name, cursor, signal);
    pullRequests.push(...page.items);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  return pullRequests;
}

/** Throws if `placeAround` did not yield a position for `index` — it always
 *  returns exactly `count` positions, so this only fires on a logic bug. */
function positionAt(positions: Position[], index: number): Position {
  const position = positions[index];
  if (position === undefined) {
    throw new Error(`placeAround returned no position for index ${String(index)}`);
  }
  return position;
}

/** A repo issues/pull-requests loader's result: the assembled document, plus
 *  the canonical list URL for normalising the address bar afterwards. */
export interface RepoListLoadResult {
  document: GraphDocument;
  canonicalUrl: string;
}

/**
 * Resolve `parsed` to a repo (via `getRepo`), fetch every open issue, and
 * assemble a fresh graph document: one repo node, one issue node per open
 * issue, `contains` edges between them. Propagates `GitHubError` on any
 * failure (unresolvable owner/repo, network, rate limit) — the caller is
 * responsible for surfacing it.
 */
export async function loadRepoIssuesDocument(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  const repo = await client.getRepo(parsed.owner, parsed.repo, signal);
  const issues = await loadAllRepoIssues(client, parsed.owner, parsed.repo, signal);

  const repoNode = repoToNode(repo, REPO_POSITION);
  const positions = placeAround(REPO_POSITION, issues.length);
  const nodes: GraphNode[] = [repoNode];
  const edges: GraphEdge[] = [];
  issues.forEach((issue, index) => {
    const node = issueToNode(parsed.owner, parsed.repo, issue, positionAt(positions, index));
    nodes.push(node);
    edges.push(containsEdge(repoNode.id, node.id));
  });

  const { document } = applyDelta(
    emptyDocument(`${parsed.owner}/${parsed.repo}`),
    buildDelta(nodes, edges),
  );
  return { document, canonicalUrl: canonicalRepoIssuesUrl(parsed) };
}

/**
 * Resolve `parsed` to a repo (via `getRepo`), fetch every open pull request,
 * and assemble a fresh graph document: one repo node, one pull-request node
 * per open pull request, `contains` edges between them. Mirrors
 * {@link loadRepoIssuesDocument} for the pull-requests list case.
 */
export async function loadRepoPullRequestsDocument(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  const repo = await client.getRepo(parsed.owner, parsed.repo, signal);
  const pullRequests = await loadAllRepoPullRequests(client, parsed.owner, parsed.repo, signal);

  const repoNode = repoToNode(repo, REPO_POSITION);
  const positions = placeAround(REPO_POSITION, pullRequests.length);
  const nodes: GraphNode[] = [repoNode];
  const edges: GraphEdge[] = [];
  pullRequests.forEach((pullRequest, index) => {
    const node = pullRequestToNode(
      parsed.owner,
      parsed.repo,
      pullRequest,
      positionAt(positions, index),
    );
    nodes.push(node);
    edges.push(containsEdge(repoNode.id, node.id));
  });

  const { document } = applyDelta(
    emptyDocument(`${parsed.owner}/${parsed.repo}`),
    buildDelta(nodes, edges),
  );
  return { document, canonicalUrl: canonicalRepoPullRequestsUrl(parsed) };
}
