import {
  resolveEdgeType,
  resolveType,
  zodSchemaForEdgeType,
  zodSchemaForType,
  type EdgeData,
  type EdgeTypeDefinition,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
  type NodeData,
  type NodeTypeDefinition,
  type Position,
} from "../schema";

import { indexNodesById, wouldCreateCycle } from "./hierarchy";

/**
 * Thrown by {@link applyOperation} when an operation cannot be applied because
 * it would violate a graph invariant (a duplicate node id, an edge whose
 * endpoint does not exist, or node data that fails its type's schema). Callers
 * can `instanceof`-check to distinguish invariant failures from other errors.
 */
export class GraphOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphOperationError";
  }
}

/**
 * A single, atomic change to a graph document. Each variant is a pure intent
 * description; {@link applyOperation} is the single place that interprets them.
 *
 * The `type` field discriminates the union. `updateNodeData` additionally
 * carries `nodeType` — the name of the node type whose schema the new `data`
 * must satisfy — so validation can resolve the right Zod schema without
 * searching the document. `updateEdge` mirrors this: it carries `edgeType`
 * and replaces the edge's `data` wholesale, validated against that type's
 * schema.
 *
 * `setParent`/`setCollapsed`/`groupNodes` model subgraphs (see
 * `GraphNode.parentId`/`collapsed` in `src/schema/node.ts`). `setParent` is
 * the primitive — `undefined` clears a node's parent. `groupNodes` is a
 * single atomic operation (one undo step) rather than an `addNode` +
 * N×`setParent` composition: it creates a new `"group"`-typed node at
 * `position` and parents every `childIds` entry onto it in one commit.
 * There is no separate `ungroupNodes` — `removeNode` already clears
 * `parentId` on any node that pointed at the removed id (see below), so
 * removing a group node *is* ungrouping it.
 *
 * `addNodes`/`removeNodes` are the same "one undo step for many nodes"
 * pattern applied to bulk add/remove — a right-click "Duplicate N nodes" or
 * "Delete N nodes" on a multi-selection composes to one of these rather than
 * N×`addNode`/`removeNode`, so a single Ctrl+Z reverts the whole bulk action.
 */
export type GraphOperation =
  | { type: "addNode"; node: GraphNode }
  | { type: "addNodes"; nodes: GraphNode[] }
  | { type: "updateNodeData"; id: string; nodeType: string; data: NodeData }
  | { type: "moveNodes"; moves: Array<{ id: string; position: Position }> }
  | { type: "removeNode"; id: string }
  | { type: "removeNodes"; ids: string[] }
  | { type: "addEdge"; edge: GraphEdge }
  | { type: "updateEdge"; id: string; edgeType: string; data: EdgeData }
  | { type: "removeEdge"; id: string }
  | { type: "renameGraph"; name: string }
  | { type: "replaceDocument"; document: GraphDocument }
  | { type: "setParent"; id: string; parentId: string | undefined }
  | { type: "setCollapsed"; id: string; collapsed: boolean }
  | {
      type: "groupNodes";
      groupId: string;
      label: string;
      childIds: string[];
      position: Position;
    };

/**
 * Narrows `unknown` to a `Record<string, unknown>` without a cast. A Zod object
 * schema always parses to a plain object, so for valid data this always holds;
 * the guard exists only to convert `safeParse`'s `unknown` output into the
 * `NodeData` shape `GraphNode.data` requires.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Replaces `node.data` with `data`, preserving the node's id, type, and
 * position. `data` is validated against the resolved node type's Zod schema
 * (the single source of truth) via {@link zodSchemaForType}; on failure this
 * throws {@link GraphOperationError} so a mismatched update fails loudly instead
 * of producing an invalid node. In practice callers always supply matching
 * data; the check exists for that invariant.
 */
function replaceNodeData(
  node: GraphNode,
  type: NodeTypeDefinition,
  data: NodeData,
): GraphNode {
  const parsed = zodSchemaForType(type).safeParse(data);
  if (!parsed.success) {
    throw new GraphOperationError(
      `updateNodeData data does not match the "${type.name}" node type`,
    );
  }
  if (!isRecord(parsed.data)) {
    throw new GraphOperationError(
      `updateNodeData data for "${type.name}" parsed to a non-record`,
    );
  }
  return { ...node, data: parsed.data };
}

/**
 * Replaces `edge.type`/`edge.data`, preserving the edge's id, source, and
 * target. `data` is validated against the resolved edge type's Zod schema
 * (the single source of truth) via {@link zodSchemaForEdgeType}; on failure
 * this throws {@link GraphOperationError} so a mismatched update fails loudly
 * instead of producing an invalid edge. Mirrors {@link replaceNodeData}.
 */
function replaceEdgeData(
  edge: GraphEdge,
  type: EdgeTypeDefinition,
  data: EdgeData,
): GraphEdge {
  const parsed = zodSchemaForEdgeType(type).safeParse(data);
  if (!parsed.success) {
    throw new GraphOperationError(
      `updateEdge data does not match the "${type.name}" edge type`,
    );
  }
  if (!isRecord(parsed.data)) {
    throw new GraphOperationError(
      `updateEdge data for "${type.name}" parsed to a non-record`,
    );
  }
  return { ...edge, type: type.name, data: parsed.data };
}

/**
 * A pure reducer: returns a NEW {@link GraphDocument} derived from `doc` with
 * `op` applied. The input document is never mutated.
 *
 * Invariant failures throw {@link GraphOperationError}:
 * - `addNode`/`addNodes` with an id that already exists in the document (or,
 *   for `addNodes`, is repeated within the same batch).
 * - `addEdge` whose `source` or `target` id is not present as a node.
 * - `updateNodeData` whose `nodeType` cannot be resolved, or whose `data` fails
 *   the resolved type's schema.
 * - `updateEdge` whose `edgeType` cannot be resolved, or whose `data` fails the
 *   resolved type's schema.
 * - `setParent`/`groupNodes` whose `parentId`/`childIds` reference a missing
 *   node id, or would make a node its own ancestor (see `hierarchy.ts`'s
 *   `wouldCreateCycle`).
 *
 * `removeNode`/`removeNodes` also remove every edge whose `source` or `target`
 * is a removed id, so the document never holds a dangling edge — and clear
 * `parentId` on every node that pointed at a removed id, so removing a node (a
 * `"group"` or otherwise) never leaves its children pointing at a node that no
 * longer exists; they're promoted back to top-level rather than
 * cascade-removed. Operations that target an id not present (`updateNodeData`,
 * `moveNodes`, `updateEdge`, `setCollapsed`) are no-ops.
 */
export function applyOperation(
  doc: GraphDocument,
  op: GraphOperation,
): GraphDocument {
  switch (op.type) {
    case "addNode": {
      if (doc.nodes.some((node) => node.id === op.node.id)) {
        throw new GraphOperationError(
          `A node with id "${op.node.id}" already exists`,
        );
      }
      return { ...doc, nodes: [...doc.nodes, op.node] };
    }

    case "addNodes": {
      const existingIds = new Set(doc.nodes.map((node) => node.id));
      const seenIds = new Set<string>();
      for (const node of op.nodes) {
        if (existingIds.has(node.id) || seenIds.has(node.id)) {
          throw new GraphOperationError(
            `A node with id "${node.id}" already exists`,
          );
        }
        seenIds.add(node.id);
      }
      return { ...doc, nodes: [...doc.nodes, ...op.nodes] };
    }

    case "updateNodeData": {
      const type = resolveType(doc.types, op.nodeType);
      if (type === undefined) {
        throw new GraphOperationError(
          `Cannot update node data: unknown type "${op.nodeType}"`,
        );
      }
      const nodes = doc.nodes.map((node) =>
        node.id === op.id ? replaceNodeData(node, type, op.data) : node,
      );
      return { ...doc, nodes };
    }

    case "moveNodes": {
      const positions = new Map<string, Position>();
      for (const move of op.moves) {
        positions.set(move.id, move.position);
      }
      const nodes = doc.nodes.map((node): GraphNode => {
        const next = positions.get(node.id);
        if (next === undefined) {
          return node;
        }
        return { ...node, position: next };
      });
      return { ...doc, nodes };
    }

    case "removeNode": {
      const nodes = doc.nodes
        .filter((node) => node.id !== op.id)
        .map((node): GraphNode => (node.parentId === op.id ? { ...node, parentId: undefined } : node));
      const edges = doc.edges.filter(
        (edge) => edge.source !== op.id && edge.target !== op.id,
      );
      return { ...doc, nodes, edges };
    }

    case "removeNodes": {
      const removedIds = new Set(op.ids);
      const nodes = doc.nodes
        .filter((node) => !removedIds.has(node.id))
        .map((node): GraphNode =>
          node.parentId !== undefined && removedIds.has(node.parentId)
            ? { ...node, parentId: undefined }
            : node,
        );
      const edges = doc.edges.filter(
        (edge) => !removedIds.has(edge.source) && !removedIds.has(edge.target),
      );
      return { ...doc, nodes, edges };
    }

    case "addEdge": {
      const knownIds = new Set(doc.nodes.map((node) => node.id));
      if (!knownIds.has(op.edge.source) || !knownIds.has(op.edge.target)) {
        throw new GraphOperationError(
          `Cannot add edge "${op.edge.id}": source or target node is missing`,
        );
      }
      return { ...doc, edges: [...doc.edges, op.edge] };
    }

    case "updateEdge": {
      const type = resolveEdgeType(doc.edgeTypes, op.edgeType);
      if (type === undefined) {
        throw new GraphOperationError(
          `Cannot update edge: unknown type "${op.edgeType}"`,
        );
      }
      const edges = doc.edges.map((edge) =>
        edge.id === op.id ? replaceEdgeData(edge, type, op.data) : edge,
      );
      return { ...doc, edges };
    }

    case "removeEdge": {
      const edges = doc.edges.filter((edge) => edge.id !== op.id);
      return { ...doc, edges };
    }

    case "renameGraph": {
      return { ...doc, name: op.name };
    }

    case "replaceDocument": {
      return op.document;
    }

    case "setParent": {
      if (op.parentId !== undefined) {
        if (!doc.nodes.some((node) => node.id === op.parentId)) {
          throw new GraphOperationError(
            `Cannot set parent: no node with id "${op.parentId}"`,
          );
        }
        if (wouldCreateCycle(indexNodesById(doc.nodes), op.id, op.parentId)) {
          throw new GraphOperationError(
            `Cannot set "${op.id}"'s parent to "${op.parentId}": would create a cycle`,
          );
        }
      }
      const nodes = doc.nodes.map((node): GraphNode =>
        node.id === op.id ? { ...node, parentId: op.parentId } : node,
      );
      return { ...doc, nodes };
    }

    case "setCollapsed": {
      const nodes = doc.nodes.map((node): GraphNode =>
        node.id === op.id ? { ...node, collapsed: op.collapsed } : node,
      );
      return { ...doc, nodes };
    }

    case "groupNodes": {
      if (doc.nodes.some((node) => node.id === op.groupId)) {
        throw new GraphOperationError(
          `A node with id "${op.groupId}" already exists`,
        );
      }
      const knownIds = new Set(doc.nodes.map((node) => node.id));
      for (const childId of op.childIds) {
        if (!knownIds.has(childId)) {
          throw new GraphOperationError(
            `Cannot group: no node with id "${childId}"`,
          );
        }
      }
      const groupNode: GraphNode = {
        id: op.groupId,
        type: "group",
        position: op.position,
        data: { label: op.label },
      };
      const childIds = new Set(op.childIds);
      const nodes = [
        ...doc.nodes.map((node): GraphNode =>
          childIds.has(node.id) ? { ...node, parentId: op.groupId } : node,
        ),
        groupNode,
      ];
      return { ...doc, nodes };
    }
  }
}
