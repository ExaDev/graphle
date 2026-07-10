import {
  resolveType,
  zodSchemaForType,
  type EdgeRelation,
  type GraphDocument,
  type GraphEdge,
  type GraphNode,
  type NodeData,
  type NodeTypeDefinition,
  type Position,
} from "../schema";

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
 * searching the document.
 */
export type GraphOperation =
  | { type: "addNode"; node: GraphNode }
  | { type: "updateNodeData"; id: string; nodeType: string; data: NodeData }
  | { type: "moveNodes"; moves: Array<{ id: string; position: Position }> }
  | { type: "removeNode"; id: string }
  | { type: "addEdge"; edge: GraphEdge }
  | {
      type: "updateEdge";
      id: string;
      relation?: EdgeRelation;
      label?: string;
    }
  | { type: "removeEdge"; id: string }
  | { type: "renameGraph"; name: string }
  | { type: "replaceDocument"; document: GraphDocument };

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
 * Applies `op.relation` and `op.label` to `edge`, honouring
 * `exactOptionalPropertyTypes`: a field is only overwritten when the caller
 * actually supplied it. Under that flag an optional property cannot carry
 * `undefined`, so `!== undefined` is a precise test for "was this field
 * provided". Fields the caller omitted are left untouched.
 *
 * The one exception is an empty-string `label`: that is treated as "clear the
 * label", not "set the label to the empty string". Because the cleared edge
 * must OMIT the `label` key entirely (optional props cannot hold `undefined`
 * under exactOptionalPropertyTypes), it is rebuilt from the required fields.
 */
function applyEdgeUpdate(
  edge: GraphEdge,
  op: { relation?: EdgeRelation; label?: string },
): GraphEdge {
  if (op.relation === undefined && op.label === undefined) {
    return edge;
  }
  const relation = op.relation !== undefined ? op.relation : edge.relation;
  if (op.label === "") {
    return { id: edge.id, source: edge.source, target: edge.target, relation };
  }
  if (op.label !== undefined) {
    return { ...edge, relation, label: op.label };
  }
  return { ...edge, relation };
}

/**
 * A pure reducer: returns a NEW {@link GraphDocument} derived from `doc` with
 * `op` applied. The input document is never mutated.
 *
 * Invariant failures throw {@link GraphOperationError}:
 * - `addNode` with an id that already exists in the document.
 * - `addEdge` whose `source` or `target` id is not present as a node.
 * - `updateNodeData` whose `nodeType` cannot be resolved, or whose `data` fails
 *   the resolved type's schema.
 *
 * `removeNode` also removes every edge whose `source` or `target` is the removed
 * id, so the document never holds a dangling edge. Operations that target an id
 * not present (`updateNodeData`, `moveNodes`, `updateEdge`) are no-ops.
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
      const nodes = doc.nodes.filter((node) => node.id !== op.id);
      const edges = doc.edges.filter(
        (edge) => edge.source !== op.id && edge.target !== op.id,
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
      const edges = doc.edges.map((edge) =>
        edge.id === op.id ? applyEdgeUpdate(edge, op) : edge,
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
  }
}
