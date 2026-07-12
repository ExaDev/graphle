import {
  resolveEdgeType,
  resolveType,
  zodSchemaForEdgeType,
  zodSchemaForType,
  type GraphDocument,
} from "../schema";

/**
 * One node or edge whose stored `data` no longer matches its resolved type's
 * schema, or whose `type` no longer resolves to any type definition at all
 * (built-in or custom). Surfaces drift introduced by editing a custom type's
 * `jsonSchema` after nodes/edges already exist against the old shape, or by
 * removing a custom type definition that is still referenced.
 */
export interface DriftEntry {
  kind: "node" | "edge";
  id: string;
  typeName: string;
  issues: string[];
}

/** Formats a single Zod issue as "path: message", or just "message" when the
 *  issue has no path (e.g. a top-level type mismatch). */
function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  if (issue.path.length === 0) {
    return issue.message;
  }
  return `${issue.path.join(".")}: ${issue.message}`;
}

/**
 * Finds every node and edge in `doc` whose `data` no longer validates against
 * its resolved type's Zod schema, or whose `type` no longer resolves at all.
 * Nodes/edges that validate cleanly are omitted; the result is empty when the
 * document has no drift. Pure — no React, no IO.
 */
export function findSchemaDrift(doc: GraphDocument): DriftEntry[] {
  const entries: DriftEntry[] = [];

  for (const node of doc.nodes) {
    const resolved = resolveType(doc.types, node.type);
    if (resolved === undefined) {
      entries.push({
        kind: "node",
        id: node.id,
        typeName: node.type,
        issues: [`Unknown type "${node.type}"`],
      });
      continue;
    }
    const parsed = zodSchemaForType(resolved).safeParse(node.data);
    if (!parsed.success) {
      entries.push({
        kind: "node",
        id: node.id,
        typeName: node.type,
        issues: parsed.error.issues.map(formatIssue),
      });
    }
  }

  for (const edge of doc.edges) {
    const resolved = resolveEdgeType(doc.edgeTypes, edge.type);
    if (resolved === undefined) {
      entries.push({
        kind: "edge",
        id: edge.id,
        typeName: edge.type,
        issues: [`Unknown type "${edge.type}"`],
      });
      continue;
    }
    const parsed = zodSchemaForEdgeType(resolved).safeParse(edge.data);
    if (!parsed.success) {
      entries.push({
        kind: "edge",
        id: edge.id,
        typeName: edge.type,
        issues: parsed.error.issues.map(formatIssue),
      });
    }
  }

  return entries;
}
