/**
 * Jump-to-node command palette, opened with `mod+K` (Mantine's default
 * shortcut). One {@link Spotlight} action per currently visible node: its
 * label is resolved the same way {@link GenericNode} resolves a node's
 * on-canvas label (`extractLabel`, via the node's type `labelField`), and its
 * icon/colour come from the same {@link getTypePresentation} the canvas uses
 * for a type's badge and border — so a search result reads as the same node
 * the canvas shows, not a re-derived summary of it.
 *
 * `<Spotlight>` is self-contained: it registers its own `mod+K` hotkey and
 * owns its own open/close state internally, so there is no separate provider
 * to mount elsewhere in the tree. It's rendered from {@link GraphCanvas}
 * rather than higher up (e.g. `AppShell`) purely because that's where the
 * live `nodes` array already lives; it needs no React Flow context of its
 * own.
 */
import { useMemo } from "react";
import { Spotlight, type SpotlightActionData } from "@mantine/spotlight";

import { resolveType } from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

import { extractLabel } from "./node-label";
import { DEFAULT_TYPE_PRESENTATION, getTypePresentation } from "./type-presentation";
import type { GraphFlowNode } from "./to-flow";

export interface NodeSearchPaletteProps {
  /** The currently visible nodes (React Flow's local, hidden-filtered
   *  projection — see `documentToFlow`), one search action per node. */
  nodes: GraphFlowNode[];
  /** Fired when a search result is chosen. */
  onSelectNode: (nodeId: string) => void;
}

/** Command palette for jumping to a node by its display label. */
export function NodeSearchPalette({ nodes, onSelectNode }: NodeSearchPaletteProps) {
  const types = useGraphStore((state) => state.document.types);

  const actions = useMemo<SpotlightActionData[]>(
    () =>
      nodes.map((node) => {
        const typeDef = resolveType(types, node.data.type);
        const presentation =
          typeDef !== undefined ? getTypePresentation(typeDef) : DEFAULT_TYPE_PRESENTATION;
        const label = typeDef !== undefined ? extractLabel(node.data, typeDef, presentation) : node.data.type;
        const Icon = presentation.Icon;
        return {
          id: node.id,
          label,
          leftSection: <Icon size={16} stroke={1.75} style={{ color: presentation.colorVar }} />,
          onClick: () => {
            onSelectNode(node.id);
          },
        };
      }),
    [nodes, types, onSelectNode],
  );

  return (
    <Spotlight actions={actions} shortcut="mod+K" searchProps={{ placeholder: "Jump to node..." }} />
  );
}
