/**
 * The node-kind registry and React Flow `nodeTypes` wiring. Pulls presentation
 * metadata from `node-kind-meta.ts` and components from `node-kinds.tsx`, then
 * exposes:
 *
 *  - `NODE_KINDS`: a `Record<NodeKind, NodeKindMeta>` with label, icon, colour,
 *    a fresh-`defaultData` factory, and the component, for use by future
 *    add-node UIs.
 *  - `nodeTypes`: the `Record<kind, component>` React Flow consumes.
 *
 * This file declares no components itself (it only imports them), so it does
 * not trip the react-refresh "only export components" rule, and there is no
 * circular import: registry -> {node-kinds.tsx, node-kind-meta.ts},
 * node-kinds.tsx -> node-kind-meta.ts.
 */
import { type FC } from "react";
import { type NodeProps, type NodeTypes } from "@xyflow/react";

import type { NodeData, NodeKind } from "@/schema";

import { KIND_PRESENTATION, type NodeKindPresentation } from "./node-kind-meta";
import {
  FreeformNode,
  IssueNode,
  OrgNode,
  ProjectNode,
  RepoNode,
} from "./node-kinds";
import type { GraphFlowNode } from "./to-flow";

/** Full metadata for a node kind: presentation plus a data factory and component. */
export interface NodeKindMeta extends NodeKindPresentation {
  /** A fresh, valid data object for a newly created node of this kind. */
  defaultData: () => NodeData;
  /** The React Flow component that renders this kind. */
  NodeComponent: FC<NodeProps<GraphFlowNode>>;
}

/** The node-kind registry, keyed by {@link NodeKind}. */
export const NODE_KINDS: Record<NodeKind, NodeKindMeta> = {
  freeform: {
    ...KIND_PRESENTATION.freeform,
    defaultData: () => ({ label: "Untitled note" }),
    NodeComponent: FreeformNode,
  },
  org: {
    ...KIND_PRESENTATION.org,
    defaultData: () => ({ login: "new-org" }),
    NodeComponent: OrgNode,
  },
  repo: {
    ...KIND_PRESENTATION.repo,
    defaultData: () => ({ owner: "owner", name: "repo" }),
    NodeComponent: RepoNode,
  },
  issue: {
    ...KIND_PRESENTATION.issue,
    defaultData: () => ({ owner: "owner", repo: "repo", number: 1, title: "New issue" }),
    NodeComponent: IssueNode,
  },
  project: {
    ...KIND_PRESENTATION.project,
    defaultData: () => ({ owner: "owner", number: 1, title: "New project" }),
    NodeComponent: ProjectNode,
  },
};

/** React Flow `nodeTypes` mapping each kind string to its component. */
export const nodeTypes: NodeTypes = {
  freeform: FreeformNode,
  org: OrgNode,
  repo: RepoNode,
  issue: IssueNode,
  project: ProjectNode,
};
