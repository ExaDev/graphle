/**
 * Loads an entire GitHub Projects (v2) project — resolved from a parsed
 * {@link ParsedProjectUrl} — into a fresh {@link GraphDocument}: a project
 * node plus one issue node per project item, connected by `tracks` edges.
 * This is the whole-project counterpart to the existing interactive
 * "project-items" expansion in `./expand` (which adds one page of items to
 * an *existing* project node already on the canvas, one UI click per page);
 * this loader instead pages through every item internally before returning,
 * since it is producing a whole graph in one shot, not incrementally
 * expanding a node the caller already has.
 *
 * Reuses the existing pure materialisers (`projectToNode`,
 * `projectIssueItemToNode`, `tracksEdge`, `buildDelta`) unchanged — no new
 * node/edge shapes are introduced. DraftIssue items are skipped, exactly as
 * the interactive expansion already does (no stable identity/URL to
 * materialise against).
 *
 * A large project means many sequential GraphQL round trips (one per
 * `PAGE_SIZE`-item page) and a real chunk of the token's rate budget; there
 * is no progress UI for this in v1.
 */
import { applyDelta, emptyDocument, placeAround } from "../domain";
import type { GraphDocument, GraphEdge, GraphNode, Position } from "../schema";

import type { GitHubClient } from "./contract";
import { buildDelta, projectIssueItemToNode, projectToNode, tracksEdge } from "./materialise";
import { canonicalProjectUrl, type ParsedProjectUrl } from "./project-url";
import type { GitHubProjectItem } from "./schema";

/** Origin position for the project node; issue nodes are placed around it. */
const PROJECT_POSITION: Position = { x: 0, y: 0 };

/** Page through every item in a project, following `endCursor` until GitHub
 *  reports no next page. */
async function loadAllProjectItems(
  client: GitHubClient,
  projectNodeId: string,
  signal: AbortSignal,
): Promise<GitHubProjectItem[]> {
  const items: GitHubProjectItem[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  while (hasNextPage) {
    const page = await client.listProjectItems(projectNodeId, cursor, signal);
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

/** {@link loadProjectDocument}'s result: the assembled document, plus the
 *  canonical project URL for normalising the address bar afterwards. */
export interface ProjectLoadResult {
  document: GraphDocument;
  canonicalUrl: string;
}

/**
 * Resolve `parsed` to a project (via `getOrgProject`/`getUserProject`
 * depending on `ownerType`), fetch every item, and assemble a fresh graph
 * document: one project node, one issue node per Issue item whose title
 * matches `searchText`, `tracks` edges between them. `searchText` is
 * graphle's own client-side filter (a case-insensitive substring match
 * against each item's title, applied after fetching every item — GitHub's
 * GraphQL API has no server-side way to filter a project's items connection,
 * so this is a materially lesser feature than GitHub's own project-view
 * filters, not a re-implementation of them); pass `""` to keep every item.
 * Propagates `GitHubError` on any failure (unresolvable owner/project,
 * network, rate limit) — the caller is responsible for surfacing it.
 */
export async function loadProjectDocument(
  parsed: ParsedProjectUrl,
  searchText: string,
  client: GitHubClient,
  signal: AbortSignal,
): Promise<ProjectLoadResult> {
  const project =
    parsed.ownerType === "org"
      ? await client.getOrgProject(parsed.login, parsed.number, signal)
      : await client.getUserProject(parsed.login, parsed.number, signal);

  const items = await loadAllProjectItems(client, project.id, signal);
  // Only Issue items are materialised; DraftIssue items are skipped (no
  // stable identity/URL to key a node on), matching the interactive
  // "project-items" expansion in ./expand.
  const normalisedSearch = searchText.toLowerCase();
  const issues = items
    .filter((item) => item.__typename === "Issue")
    .filter((item) => normalisedSearch === "" || item.title.toLowerCase().includes(normalisedSearch));

  const projectNode = projectToNode(parsed.login, project, PROJECT_POSITION);
  const positions = placeAround(PROJECT_POSITION, issues.length);
  const nodes: GraphNode[] = [projectNode];
  const edges: GraphEdge[] = [];
  issues.forEach((item, index) => {
    const node = projectIssueItemToNode(item, positionAt(positions, index));
    nodes.push(node);
    edges.push(tracksEdge(projectNode.id, node.id));
  });

  const { document } = applyDelta(emptyDocument(project.title), buildDelta(nodes, edges));
  return { document, canonicalUrl: canonicalProjectUrl(parsed, searchText) };
}
