/**
 * React Flow node components for each graph node kind. This file exports ONLY
 * components (so react-refresh fast refresh stays happy); the NODE_KINDS
 * registry and `nodeTypes` wiring live in `node-kinds-registry.ts` and pull
 * presentation metadata from `node-kind-meta.ts`.
 *
 * Each kind component narrows its `data` (the whole domain GraphNode) on `kind`
 * and delegates rendering to the shared {@link NodeCard}.
 */
import { Badge } from "@mantine/core";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { NodeKind } from "@/schema";

import { KIND_PRESENTATION } from "./node-kind-meta";
import type { GraphFlowNode } from "./to-flow";
import {
  kindBorder,
  kindIcon,
  nodeCard,
  nodeHeader,
  nodeLabel,
} from "./node-kinds.css";

interface NodeCardProps {
  kind: NodeKind;
  /** Primary label for the node (data-derived, so passed in by the kind component). */
  label: string;
}

/**
 * Shared node shell: accent border, a target handle on the left, a source
 * handle on the right, the kind icon + primary label, and a kind badge.
 * Presentation (icon, colour, badge label) comes from {@link KIND_PRESENTATION}.
 */
function NodeCard({ kind, label }: NodeCardProps) {
  const presentation = KIND_PRESENTATION[kind];
  const Icon = presentation.icon;
  return (
    <div className={`${nodeCard} ${kindBorder[kind]}`}>
      <Handle type="target" position={Position.Left} />
      <div className={nodeHeader}>
        <Icon size={16} stroke={1.75} className={kindIcon[kind]} />
        <div className={nodeLabel}>{label}</div>
      </div>
      <Badge color={presentation.color} size="xs" variant="light">
        {presentation.label}
      </Badge>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

// React Flow routes each node to its component by `type` (the node kind), so by
// construction `data` is always the matching variant. The `kind` guard narrows
// the discriminated union for the type system; it never fails at runtime.

export function FreeformNode({ data }: NodeProps<GraphFlowNode>) {
  if (data.kind !== "freeform") return null;
  return <NodeCard kind="freeform" label={data.data.label} />;
}

export function OrgNode({ data }: NodeProps<GraphFlowNode>) {
  if (data.kind !== "org") return null;
  return <NodeCard kind="org" label={data.data.login} />;
}

export function RepoNode({ data }: NodeProps<GraphFlowNode>) {
  if (data.kind !== "repo") return null;
  return <NodeCard kind="repo" label={data.data.name} />;
}

export function IssueNode({ data }: NodeProps<GraphFlowNode>) {
  if (data.kind !== "issue") return null;
  return <NodeCard kind="issue" label={data.data.title} />;
}

export function ProjectNode({ data }: NodeProps<GraphFlowNode>) {
  if (data.kind !== "project") return null;
  return <NodeCard kind="project" label={data.data.title} />;
}
