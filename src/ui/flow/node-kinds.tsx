/**
 * The single React Flow node component. There are no per-type components any
 * more: every graph node renders through {@link GenericNode}, which derives its
 * icon, accent colour, and badge label from the node's type definition, and its
 * primary label from the type's `labelField`. The type definition is resolved
 * from the live document's `types` (falling back to the built-in registry), so
 * user-defined and built-in types render identically.
 *
 * A node with children (`data.childCount > 0`, precomputed by
 * `to-flow.ts#documentToFlow`) also shows a collapse/expand toggle, dispatching
 * `setCollapsed` — see `GraphNode.parentId`/`collapsed`'s doc comment in
 * `src/schema/node.ts` for the subgraph model this is part of.
 *
 * This file exports ONLY the component, so react-refresh fast refresh stays
 * happy; the `nodeTypes` wiring lives in {@link ./type-presentation.ts}.
 */
import { Badge, Tooltip } from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconClockExclamation } from "@tabler/icons-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { resolveType } from "@/schema";
import { useGraphStore } from "@/ui/store/graph-store";

import { extractLabel } from "./node-label";
import {
  collapseToggle,
  connectionHandle,
  nodeCard,
  nodeHeader,
  nodeLabel,
  staleIcon,
} from "./node-kinds.css";
import { DEFAULT_TYPE_PRESENTATION, getTypePresentation } from "./type-presentation";
import type { GraphFlowNode } from "./to-flow";

/** How long after a GitHub fetch a node is considered stale, shown by a small
 *  clock badge prompting a refresh — see `fetchedAt`'s doc comment in
 *  `src/schema/node.ts`. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Whether a GitHub-sourced node's `fetchedAt` is older than
 *  {@link STALE_AFTER_MS}. Manually-created nodes (`fetchedAt === undefined`)
 *  are never stale. Compared against `Date.now()` at render time — accurate
 *  as of the component's last render, which is sufficient for a "roughly a
 *  day old" indicator with no need for a ticking clock. */
function isStale(fetchedAt: string | undefined): boolean {
  if (fetchedAt === undefined) return false;
  return Date.now() - Date.parse(fetchedAt) > STALE_AFTER_MS;
}

/**
 * Render any graph node. Presentation (glyph, accent, badge) comes from the
 * resolved type definition via {@link getTypePresentation}; the accent colour is
 * applied inline as a Mantine CSS variable so it tracks the type's `color`
 * without build-time per-type style atoms.
 */
export function GenericNode({ data }: NodeProps<GraphFlowNode>) {
  const types = useGraphStore((state) => state.document.types);
  const apply = useGraphStore((state) => state.apply);
  const typeDef = resolveType(types, data.type);
  const presentation =
    typeDef !== undefined ? getTypePresentation(typeDef) : DEFAULT_TYPE_PRESENTATION;
  const Icon = presentation.Icon;
  const label = typeDef !== undefined ? extractLabel(data, typeDef, presentation) : data.type;
  const collapsed = data.collapsed === true;
  const stale = isStale(data.fetchedAt);

  return (
    <div className={nodeCard} style={{ borderColor: presentation.colorVar }}>
      {/* One drag-to-connect affordance per side, all `type="source"` so
       *  `connectionMode="loose"` (see `GraphCanvas.tsx`) lets a drag start or
       *  end at any of them. These only ever create connections — the actual
       *  rendered edge path is decided independently and continuously by
       *  `FloatingEdge`, not by which handle a node happens to expose. */}
      <Handle
        type="source"
        position={Position.Top}
        id="top"
        className={connectionHandle}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className={connectionHandle}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className={connectionHandle}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className={connectionHandle}
      />
      <div className={nodeHeader}>
        <Icon size={16} stroke={1.75} style={{ color: presentation.colorVar }} />
        <div className={nodeLabel}>{label}</div>
        {stale && (
          <Tooltip label="Last fetched over a day ago - right-click to refresh">
            <IconClockExclamation size={13} stroke={1.75} className={staleIcon} />
          </Tooltip>
        )}
      </div>
      <Badge
        size="xs"
        variant="light"
        {...(typeDef?.color !== undefined ? { color: typeDef.color } : {})}
      >
        {presentation.label}
      </Badge>
      {data.childCount > 0 && (
        <button
          type="button"
          className={collapseToggle}
          onClick={(event) => {
            event.stopPropagation();
            apply({ type: "setCollapsed", id: data.id, collapsed: !collapsed });
          }}
        >
          {collapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          {collapsed ? `${String(data.childCount)} hidden` : `${String(data.childCount)} children`}
        </button>
      )}
    </div>
  );
}
