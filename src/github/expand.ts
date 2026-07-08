import { placeAround, type GraphDelta } from "../domain";
import type { GraphEdge, GraphNode, NodeKind, Position } from "../schema";
import type { GitHubClient } from "./contract";
import {
  buildDelta,
  containsEdge,
  issueToNode,
  ownsEdge,
  projectIssueItemToNode,
  projectToNode,
  repoToNode,
  tracksEdge,
} from "./materialise";

/**
 * The result of an expansion's {@link Expansion.run}: a delta to fold into the
 * document plus the pagination tail so a caller can request the next page.
 */
export type ExpansionResult = {
  delta: GraphDelta;
  endCursor: string | undefined;
  hasNextPage: boolean;
};

/**
 * An expansion fetches the children of a source node from GitHub and
 * materialises them into a graph delta. `id`/`label` drive the UI affordance
 * (e.g. a "Repositories" button on an org node); `run` does the work and is
 * given the cursor so the same expansion can be re-invoked for the next page.
 */
export type Expansion = {
  id: string;
  label: string;
  run: (
    source: GraphNode,
    client: GitHubClient,
    cursor: string | undefined,
    signal: AbortSignal,
  ) => Promise<ExpansionResult>;
};

/**
 * Throws if `placeAround` did not yield a position for `index`. It always
 * returns exactly `count` positions, so this only fires on a logic bug — fail
 * loudly rather than silently drop a node.
 */
function positionAt(positions: Position[], index: number): Position {
  const position = positions[index];
  if (position === undefined) {
    throw new Error(
      `placeAround returned no position for index ${String(index)}`,
    );
  }
  return position;
}

const orgRepos: Expansion = {
  id: "org-repos",
  label: "Repositories",
  async run(source, client, cursor, signal) {
    if (source.kind !== "org") {
      throw new Error("org-repos expansion requires an org source node");
    }
    const page = await client.listOrgRepos(source.data.login, cursor, signal);
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((repo, i) =>
      repoToNode(repo, positionAt(positions, i)),
    );
    const edges = nodes.map((node) => ownsEdge(source.id, node.id));
    return {
      delta: buildDelta(nodes, edges),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },
};

const orgProjects: Expansion = {
  id: "org-projects",
  label: "Projects",
  async run(source, client, cursor, signal) {
    if (source.kind !== "org") {
      throw new Error("org-projects expansion requires an org source node");
    }
    const page = await client.listOrgProjects(source.data.login, cursor, signal);
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((project, i) =>
      projectToNode(source.data.login, project, positionAt(positions, i)),
    );
    const edges = nodes.map((node) => ownsEdge(source.id, node.id));
    return {
      delta: buildDelta(nodes, edges),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },
};

const repoIssues: Expansion = {
  id: "repo-issues",
  label: "Issues",
  async run(source, client, cursor, signal) {
    if (source.kind !== "repo") {
      throw new Error("repo-issues expansion requires a repo source node");
    }
    const page = await client.listRepoIssues(
      source.data.owner,
      source.data.name,
      cursor,
      signal,
    );
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((issue, i) =>
      issueToNode(
        source.data.owner,
        source.data.name,
        issue,
        positionAt(positions, i),
      ),
    );
    const edges = nodes.map((node) => containsEdge(source.id, node.id));
    return {
      delta: buildDelta(nodes, edges),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },
};

const repoProjects: Expansion = {
  id: "repo-projects",
  label: "Projects",
  async run(source, client, cursor, signal) {
    if (source.kind !== "repo") {
      throw new Error("repo-projects expansion requires a repo source node");
    }
    const page = await client.listRepoProjects(
      source.data.owner,
      source.data.name,
      cursor,
      signal,
    );
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((project, i) =>
      projectToNode(source.data.owner, project, positionAt(positions, i)),
    );
    const edges = nodes.map((node) => ownsEdge(source.id, node.id));
    return {
      delta: buildDelta(nodes, edges),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },
};

const projectItems: Expansion = {
  id: "project-items",
  label: "Items",
  async run(source, client, cursor, signal) {
    if (source.kind !== "project") {
      throw new Error("project-items expansion requires a project source node");
    }
    const projectNodeId = source.data.projectNodeId;
    if (projectNodeId === undefined) {
      throw new Error(
        "project-items expansion requires a project node with a projectNodeId",
      );
    }
    const page = await client.listProjectItems(projectNodeId, cursor, signal);
    // Only Issue items are materialised. DraftIssue items are skipped in v1:
    // they would become freeform nodes, which carry no identity key, so
    // re-expanding would duplicate them. (PullRequest items are already
    // excluded by the response schema.) Revisit as a dedicated node kind if
    // mapping draft-issue placeholders becomes a real need.
    const issues = page.items.filter((item) => item.__typename === "Issue");
    const positions = placeAround(source.position, issues.length);
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    issues.forEach((item, i) => {
      const node = projectIssueItemToNode(item, positionAt(positions, i));
      nodes.push(node);
      edges.push(tracksEdge(source.id, node.id));
    });
    return {
      delta: buildDelta(nodes, edges),
      endCursor: page.endCursor,
      hasNextPage: page.hasNextPage,
    };
  },
};

/**
 * The expansions available for each node kind. `org` and `repo` nodes offer both
 * their owned children (repos / issues) and their projects; `project` nodes
 * offer their items; `issue` and `freeform` nodes have nothing to expand into.
 */
export const expansionsFor: Record<NodeKind, Expansion[]> = {
  org: [orgRepos, orgProjects],
  repo: [repoIssues, repoProjects],
  project: [projectItems],
  issue: [],
  freeform: [],
};
