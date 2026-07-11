/**
 * Pure traversal helpers for `GraphNode.parentId`/`collapsed` — the subgraph
 * model documented on `GraphNodeSchema` in `src/schema/node.ts`. No React, no
 * IO: reused both by `operations.ts` (the `setParent` cycle check) and
 * `src/ui/flow/to-flow.ts` (hiding a collapsed node's descendants and
 * rerouting their boundary-crossing edges).
 */
import type { GraphNode } from "../schema";

/** Builds an id -> node lookup once per call site, avoiding an O(n) `find`
 *  on every traversal step. */
export function indexNodesById(nodes: readonly GraphNode[]): Map<string, GraphNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

/**
 * True if `nodeId` is hidden because some ancestor (walking up via
 * `parentId`) has `collapsed: true`. The collapsed ancestor itself is never
 * hidden by this check — only its descendants are; the ancestor stays
 * visible so its collapse toggle remains reachable.
 */
export function isHidden(nodeId: string, nodesById: ReadonlyMap<string, GraphNode>): boolean {
  const node = nodesById.get(nodeId);
  if (node === undefined || node.parentId === undefined) return false;
  const parent = nodesById.get(node.parentId);
  if (parent === undefined) return false;
  if (parent.collapsed === true) return true;
  return isHidden(parent.id, nodesById);
}

/**
 * Walks up from `nodeId` until it reaches a node that is not hidden (per
 * {@link isHidden}), returning that node's id. For a node that is not itself
 * hidden, this is `nodeId` unchanged. Used to reroute an edge whose endpoint
 * has been collapsed away to the nearest visible ancestor — the "reroute to
 * the group node" behaviour.
 */
export function visibleAncestor(nodeId: string, nodesById: ReadonlyMap<string, GraphNode>): string {
  if (!isHidden(nodeId, nodesById)) return nodeId;
  const node = nodesById.get(nodeId);
  if (node === undefined || node.parentId === undefined) {
    throw new Error(`isHidden(${nodeId}) was true but it has no parentId to walk up from`);
  }
  return visibleAncestor(node.parentId, nodesById);
}

/**
 * True if setting `id`'s parent to `newParentId` would create a cycle —
 * `newParentId` is `id` itself, or `id` already appears in `newParentId`'s
 * own ancestor chain. Checked by `setParent`/`groupNodes` in
 * `operations.ts` before committing the change.
 */
export function wouldCreateCycle(
  nodesById: ReadonlyMap<string, GraphNode>,
  id: string,
  newParentId: string,
): boolean {
  if (newParentId === id) return true;
  let current: string | undefined = newParentId;
  while (current !== undefined) {
    if (current === id) return true;
    current = nodesById.get(current)?.parentId;
  }
  return false;
}

/** The number of nodes whose `parentId` is `nodeId`. */
export function childCount(nodeId: string, nodes: readonly GraphNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.parentId === nodeId) count += 1;
  }
  return count;
}

/** Every node reachable from `nodeId` via `parentId` (children, grandchildren,
 *  ...), not including `nodeId` itself. Used to translate a collapsed node's
 *  hidden descendants along with it when it's dragged. */
export function descendantIds(nodeId: string, nodes: readonly GraphNode[]): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId === undefined) continue;
    const siblings = childrenByParent.get(node.parentId);
    if (siblings === undefined) {
      childrenByParent.set(node.parentId, [node.id]);
    } else {
      siblings.push(node.id);
    }
  }
  const result: string[] = [];
  const queue: string[] = [];
  const initialChildren = childrenByParent.get(nodeId);
  if (initialChildren !== undefined) queue.push(...initialChildren);
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) continue;
    result.push(id);
    const children = childrenByParent.get(id);
    if (children !== undefined) queue.push(...children);
  }
  return result;
}
