/**
 * Shared node-label resolution, split out of `node-kinds.tsx` so it can be
 * imported by non-component UI surfaces (e.g. `NodeSearchPalette`) without
 * pulling that file's `GenericNode` export into scope. Fast refresh only
 * works when a component file exports components alone (see `node-kinds.tsx`'s
 * module doc comment), so a pure helper shared with another module has to
 * live outside it.
 */
import type { GraphNode, NodeTypeDefinition } from "@/schema";

import type { TypePresentation } from "./type-presentation";

/**
 * Extract a node's display label from its data via the type's `labelField`. A
 * non-string (missing or wrong-typed) value falls back to the type's human
 * label, so a fresh node whose label field is not yet filled still shows a
 * recognisable title rather than a blank.
 */
export function extractLabel(
  node: GraphNode,
  typeDef: NodeTypeDefinition,
  presentation: TypePresentation,
): string {
  const value = node.data[typeDef.labelField];
  return typeof value === "string" ? value : presentation.label;
}
