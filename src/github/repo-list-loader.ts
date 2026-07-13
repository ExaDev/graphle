/**
 * Loads an entire GitHub repo issues list or pull-requests list — resolved
 * from a parsed {@link ParsedRepoListUrl} plus a {@link RepoIssuesFilters}/
 * {@link RepoPullRequestsFilters} — into a fresh {@link GraphDocument}: a
 * repo node plus one issue (or pull request) node per matching item,
 * connected by `contains` edges. This is the whole-list counterpart to the
 * existing interactive "repo-issues"/"repo-pull-requests" expansions in `./expand`
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
import type { RepoIssuesFilters, RepoPullRequestsFilters } from "./filters";
import {
  buildDelta,
  containsEdge,
  issueToNode,
  pullRequestToNode,
  pullRequestWithRepoToNode,
  repoToNode,
} from "./materialise";
import {
  canonicalRepoIssuesUrl,
  canonicalRepoPullRequestsUrl,
  type ParsedRepoListUrl,
} from "./repo-list-url";
import type { GitHubIssue, GitHubPullRequest, GitHubPullRequestWithRepo } from "./schema";

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
 *
 * `listPage`/`itemToNode` take only what varies page-to-page/item-to-item
 * (cursor; item+position) — `owner`/`name`/`filters` are closed over by each
 * caller's own lambda rather than threaded through here, since the search-API
 * path `loadRepoPullRequestsDocument` uses for a filtered load has neither a
 * fixed owner/name pair (a search result carries its own `repository`) nor a
 * `filters` object shaped like the ordinary list connection expects (it's
 * folded into the query string before this function ever sees it).
 */
async function loadRepoListDocument<TItem>(
  parsed: ParsedRepoListUrl,
  client: GitHubClient,
  signal: AbortSignal,
  listPage: (cursor: string | undefined) => Promise<Page<TItem>>,
  itemToNode: (item: TItem, position: Position) => GraphNode,
  canonicalUrl: string,
): Promise<RepoListLoadResult> {
  const repo = await client.getRepo(parsed.owner, parsed.repo, signal);
  const items = await loadAllPages(listPage);

  const repoNode = repoToNode(repo, REPO_POSITION);
  const positions = placeAround(REPO_POSITION, items.length);
  const nodes: GraphNode[] = [repoNode];
  const edges: GraphEdge[] = [];
  items.forEach((item, index) => {
    const node = itemToNode(item, positionAt(positions, index));
    nodes.push(node);
    edges.push(containsEdge(repoNode.id, node.id));
  });

  const { document } = applyDelta(
    emptyDocument(`${parsed.owner}/${parsed.repo}`),
    buildDelta(nodes, edges),
  );
  return { document, canonicalUrl };
}

/**
 * Resolve `parsed` to a repo, fetch every issue matching `filters`, and
 * assemble a fresh graph document: one repo node, one issue node per issue,
 * `contains` edges between them.
 */
export function loadRepoIssuesDocument(
  parsed: ParsedRepoListUrl,
  filters: RepoIssuesFilters,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  return loadRepoListDocument<GitHubIssue>(
    parsed,
    client,
    signal,
    (cursor) => client.listRepoIssues(parsed.owner, parsed.repo, cursor, filters, signal),
    (item, position) => issueToNode(parsed.owner, parsed.repo, item, position),
    canonicalRepoIssuesUrl(parsed, filters),
  );
}

/** True when `filters` can only be satisfied via the search API — GitHub's
 *  `Repository.pullRequests` connection has no assignee/author/involves
 *  argument at all (see `RepoPullRequestsFilters`'s doc comment). */
function needsPullRequestSearch(filters: RepoPullRequestsFilters): boolean {
  return filters.assignee !== undefined || filters.author !== undefined || filters.involves !== undefined;
}

/** Builds the GitHub search-DSL query string equivalent to `filters`, scoped
 *  to one repo. `is:pr` is deliberately omitted — `client.searchPullRequests`
 *  appends it itself so every caller's results stay homogeneous. */
function buildPullRequestSearchQuery(parsed: ParsedRepoListUrl, filters: RepoPullRequestsFilters): string {
  const parts = [`repo:${parsed.owner}/${parsed.repo}`];
  for (const state of filters.states) parts.push(`is:${state}`);
  for (const label of filters.labels) parts.push(`label:"${label}"`);
  parts.push(`sort:${filters.sort.field}-${filters.sort.direction}`);
  if (filters.assignee !== undefined) parts.push(`assignee:${filters.assignee}`);
  if (filters.author !== undefined) parts.push(`author:${filters.author}`);
  if (filters.involves !== undefined) parts.push(`involves:${filters.involves}`);
  return parts.join(" ");
}

/**
 * Resolve `parsed` to a repo, fetch every pull request matching `filters`,
 * and assemble a fresh graph document: one repo node, one pull-request node
 * per pull request, `contains` edges between them. Mirrors
 * {@link loadRepoIssuesDocument} for the pull-requests list case.
 *
 * When `filters` sets assignee/author/involves, routes through
 * `client.searchPullRequests` (GitHub's `search` API, the only connection
 * that supports those qualifiers for pull requests) instead of the ordinary
 * `listRepoPullRequests` connection, which has no argument for any of them.
 * GitHub's search caps at 1,000 total results; the existing `hasNextPage`
 * pagination loop just stops there naturally, no special handling needed.
 */
export function loadRepoPullRequestsDocument(
  parsed: ParsedRepoListUrl,
  filters: RepoPullRequestsFilters,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<RepoListLoadResult> {
  const canonicalUrl = canonicalRepoPullRequestsUrl(parsed, filters);
  if (needsPullRequestSearch(filters)) {
    const query = buildPullRequestSearchQuery(parsed, filters);
    return loadRepoListDocument<GitHubPullRequestWithRepo>(
      parsed,
      client,
      signal,
      (cursor) => client.searchPullRequests(query, cursor, signal),
      pullRequestWithRepoToNode,
      canonicalUrl,
    );
  }
  return loadRepoListDocument<GitHubPullRequest>(
    parsed,
    client,
    signal,
    (cursor) => client.listRepoPullRequests(parsed.owner, parsed.repo, cursor, filters, signal),
    (item, position) => pullRequestToNode(parsed.owner, parsed.repo, item, position),
    canonicalUrl,
  );
}
