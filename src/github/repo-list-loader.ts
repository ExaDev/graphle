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
 * node/edge shapes are introduced. `loadRepoIssuesDocument` and
 * `loadRepoPullRequestsDocument` are both thin instantiations of one shared
 * `loadRepoListDocument` helper, generic over the item type — the two only
 * ever differed in which client method, materialiser, and canonical-URL
 * builder they used, so duplicating the pagination-and-assembly loop itself
 * would just be two copies of the same logic drifting apart over time.
 *
 * A large repo means many sequential GraphQL round trips (one per `PAGE_SIZE`
 * -item page) and a real chunk of the token's rate budget; there is no
 * progress UI for this in v1.
 */
import { applyDelta, emptyDocument, placeAround } from "../domain";
import type { GraphDocument, GraphEdge, GraphNode, Position } from "../schema";

import type { GitHubClient, Page } from "./contract";
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

/** Page through every open item in a repo via `listPage`, following
 *  `endCursor` until GitHub reports no next page. */
async function loadAllPages<TItem>(
  listPage: (cursor: string | undefined) => Promise<Page<TItem>>,
): Promise<TItem[]> {
  const items: TItem[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await listPage(cursor);
    items.push(...page.items);
    cursor = page.endCursor;
    hasNextPage = page.hasNextPage;
  }
  return items;
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
 * Resolve `parsed` to a repo (via `getRepo`), fetch every open item via
 * `listPage`, and assemble a fresh graph document: one repo node, one item
 * node per open item (via `itemToNode`), `contains` edges between them.
 * Propagates `GitHubError` on any failure (unresolvable owner/repo, network,
 * rate limit) — the caller is responsible for surfacing it. Shared by
 * {@link loadRepoIssuesDocument} and {@link loadRepoPullRequestsDocument}.
 */
async function loadRepoListDocument<TItem>(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
  listPage: (
    client: GitHubClient,
    owner: string,
    name: string,
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<Page<TItem>>,
  itemToNode: (owner: string, name: string, item: TItem, position: Position) => GraphNode,
  canonicalUrl: (parsed: ParsedRepoListUrl) => string,
): Promise<RepoListLoadResult> {
  const repo = await client.getRepo(parsed.owner, parsed.repo, signal);
  const items = await loadAllPages((cursor) =>
    listPage(client, parsed.owner, parsed.repo, cursor, signal),
  );

  const repoNode = repoToNode(repo, REPO_POSITION);
  const positions = placeAround(REPO_POSITION, items.length);
  const nodes: GraphNode[] = [repoNode];
  const edges: GraphEdge[] = [];
  items.forEach((item, index) => {
    const node = itemToNode(parsed.owner, parsed.repo, item, positionAt(positions, index));
    nodes.push(node);
    edges.push(containsEdge(repoNode.id, node.id));
  });

  const { document } = applyDelta(
    emptyDocument(`${parsed.owner}/${parsed.repo}`),
    buildDelta(nodes, edges),
  );
  return { document, canonicalUrl: canonicalUrl(parsed) };
}

/**
 * Resolve `parsed` to a repo, fetch every open issue, and assemble a fresh
 * graph document: one repo node, one issue node per open issue, `contains`
 * edges between them.
 */
export function loadRepoIssuesDocument(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  return loadRepoListDocument<GitHubIssue>(
    parsed,
    client,
    signal,
    (c, owner, name, cursor, sig) => c.listRepoIssues(owner, name, cursor, sig),
    issueToNode,
    canonicalRepoIssuesUrl,
  );
}

/**
 * Resolve `parsed` to a repo, fetch every open pull request, and assemble a
 * fresh graph document: one repo node, one pull-request node per open pull
 * request, `contains` edges between them. Mirrors
 * {@link loadRepoIssuesDocument} for the pull-requests list case.
 */
export function loadRepoPullRequestsDocument(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  return loadRepoListDocument<GitHubPullRequest>(
    parsed,
    client,
    signal,
    (c, owner, name, cursor, sig) => c.listRepoPullRequests(owner, name, cursor, sig),
    pullRequestToNode,
    canonicalRepoPullRequestsUrl,
  );
}
