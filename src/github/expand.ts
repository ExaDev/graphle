import { placeAround, type GraphDelta } from "../domain";
import type { GraphEdge, GraphNode, Position } from "../schema";
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

/**
 * Reads a required string field from a source node's `data` bag. The expansion
 * has already guarded the node's `type`, so a missing or non-string value means
 * the document's data does not match its declared type (a corrupt or unmigrated
 * document) — fail loudly rather than silently send a malformed request.
 */
function requireString(node: GraphNode, field: string): string {
  const value = node.data[field];
  if (typeof value !== "string") {
    throw new Error(
      `expected string field "${field}" on "${node.type}" node ${node.id}`,
    );
  }
  return value;
}

const orgRepos: Expansion = {
  id: "org-repos",
  label: "Repositories",
  async run(source, client, cursor, signal) {
    if (source.type !== "org") {
      throw new Error("org-repos expansion requires an org source node");
    }
    const login = requireString(source, "login");
    const page = await client.listOrgRepos(login, cursor, signal);
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
    if (source.type !== "org") {
      throw new Error("org-projects expansion requires an org source node");
    }
    const login = requireString(source, "login");
    const page = await client.listOrgProjects(login, cursor, signal);
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((project, i) =>
      projectToNode(login, project, positionAt(positions, i)),
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
    if (source.type !== "repo") {
      throw new Error("repo-issues expansion requires a repo source node");
    }
    const owner = requireString(source, "owner");
    const name = requireString(source, "name");
    const page = await client.listRepoIssues(owner, name, cursor, signal);
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((issue, i) =>
      issueToNode(owner, name, issue, positionAt(positions, i)),
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
    if (source.type !== "repo") {
      throw new Error("repo-projects expansion requires a repo source node");
    }
    const owner = requireString(source, "owner");
    const name = requireString(source, "name");
    const page = await client.listRepoProjects(owner, name, cursor, signal);
    const positions = placeAround(source.position, page.items.length);
    const nodes = page.items.map((project, i) =>
      projectToNode(owner, project, positionAt(positions, i)),
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
    if (source.type !== "project") {
      throw new Error("project-items expansion requires a project source node");
    }
    const projectNodeId = requireString(source, "projectNodeId");
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
 * The expansions available for a node type. `org` and `repo` nodes offer both
 * their owned children (repos / issues) and their projects; `project` nodes
 * offer their items; every other type (including `issue`, `freeform`, and any
 * custom type) has nothing to expand into, so an empty list is returned.
 */
export function expansionsForType(typeName: string): Expansion[] {
  switch (typeName) {
    case "org":
      return [orgRepos, orgProjects];
    case "repo":
      return [repoIssues, repoProjects];
    case "project":
      return [projectItems];
    default:
      return [];
  }
}
