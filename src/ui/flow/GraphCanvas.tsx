/**
 * The interactive graph surface: a controlled `<ReactFlow>` driven by the
 * zustand graph store.
 *
 * Two sources of truth, by design:
 *  - The store DOCUMENT owns graph contents (nodes, edges, positions, data).
 *    It is what gets serialised to the URL and IndexedDB.
 *  - React Flow's LOCAL state owns live interaction (the in-progress drag, the
 *    measured node dimensions, the selection flags). These never reach the
 *    document: positions commit only on drag STOP (so the URL does not churn
 *    on every drag tick), and selection is mirrored to `store.selection`
 *    separately.
 *
 * The store-to-React-Flow sync (the effect below) fires on STRUCTURAL or DATA
 * changes — when a node/edge is added, removed, edited from the inspector, or
 * loaded externally via `replaceDocument`. Position-only commits from
 * drag-stop leave the fingerprint unchanged, so React Flow's live drag state
 * is never blown away mid-drag.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMantineColorScheme } from "@mantine/core";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
} from "@xyflow/react";

import { useGraphStore } from "@/ui/store/graph-store";

import { type ContextMenuState } from "./ContextMenu";
import { documentToFlow, type GraphFlowEdge, type GraphFlowNode } from "./to-flow";
import { nodeTypes } from "./type-presentation";

export interface GraphCanvasProps {
  /**
   * Fired on a right-click over a node, edge, or the pane. Receives a fully
   * formed {@link ContextMenuState}: for node/edge it carries the target id;
   * for the pane it carries the click converted to flow space (computed here,
   * where `useReactFlow().screenToFlowPosition` is in scope) so the owner can
   * seed an "Add node here" without needing its own React Flow context.
   */
  onContextMenu: (state: ContextMenuState) => void;
}

export function GraphCanvas({ onContextMenu }: GraphCanvasProps) {
  const graphDocument = useGraphStore((s) => s.document);
  const graphId = useGraphStore((s) => s.graphId);
  const apply = useGraphStore((s) => s.apply);
  const setSelection = useGraphStore((s) => s.setSelection);
  const { fitView, screenToFlowPosition } = useReactFlow();
  // Drive React Flow's colour mode from the Mantine scheme so the controls and
  // minimap follow light/dark/system (React Flow otherwise defaults to light).
  const { colorScheme } = useMantineColorScheme();
  const flowColorMode = colorScheme === "auto" ? "system" : colorScheme;

  // React Flow local state, seeded once from the document.
  const [nodes, setNodes] = useState<GraphFlowNode[]>(
    () => documentToFlow(graphDocument).nodes,
  );
  const [edges, setEdges] = useState<GraphFlowEdge[]>(
    () => documentToFlow(graphDocument).edges,
  );

  // Re-sync React Flow from the store when the STRUCTURE or the node/edge DATA
  // changes — an add, remove, inspector data edit, or external document load —
  // but never on position-only commits, so a drag-stop does not blow away
  // React Flow's live state. Positions are deliberately excluded from the
  // fingerprint; ids, types, data, relation and label are included, so edits
  // made in the inspector reach the canvas without re-syncing mid-drag. The
  // previous fingerprint is kept in a ref and compared inside the effect (refs
  // must not be mutated during render).
  const prevStructureRef = useRef("");
  // One-shot "fit the view to the content" flag. The `fitView` prop covers
  // nodes present at init; this covers a shared graph loaded via the URL after
  // mount (the common `#g=` case).
  const hasFitRef = useRef(false);
  // Loading a different graph (drawer load / save-as / import) changes graphId;
  // reset the one-shot fit flag so the newly loaded content is framed again,
  // even though its data signature triggers the resync below.
  useEffect(() => {
    hasFitRef.current = false;
  }, [graphId]);
  useEffect(() => {
    const nodeSignature = graphDocument.nodes
      .map((n) => `${n.id}:${n.type}:${JSON.stringify(n.data)}`)
      .join("\n");
    const edgeSignature = graphDocument.edges
      .map((e) => `${e.id}:${e.type}:${JSON.stringify(e.data)}`)
      .join("\n");
    const signature = `${nodeSignature}|${edgeSignature}`;
    if (signature === prevStructureRef.current) return;
    prevStructureRef.current = signature;
    const flow = documentToFlow(graphDocument);
    // Merge against the live local nodes/edges rather than replacing wholesale,
    // so a data-change resync preserves the transient `selected`/`measured`
    // flags. Without this, an inspector edit re-projects nodes with no
    // `selected`, React Flow fires onSelectionChange empty, and the selection
    // (hence the inspector) is lost on every keystroke.
    setNodes((prev) =>
      flow.nodes.map((node) => {
        const existing = prev.find((p) => p.id === node.id);
        if (existing === undefined) return node;
        return {
          ...node,
          ...(existing.selected !== undefined ? { selected: existing.selected } : {}),
          ...(existing.measured !== undefined ? { measured: existing.measured } : {}),
        };
      }),
    );
    setEdges((prev) =>
      flow.edges.map((edge) => {
        const existing = prev.find((p) => p.id === edge.id);
        if (existing === undefined) return edge;
        return {
          ...edge,
          ...(existing.selected !== undefined ? { selected: existing.selected } : {}),
        };
      }),
    );
    if (!hasFitRef.current && flow.nodes.length > 0) {
      hasFitRef.current = true;
      // Defer one frame so React Flow registers the new nodes before fitting.
      window.requestAnimationFrame(() => {
        void fitView();
      });
    }
  }, [graphDocument, fitView, setNodes, setEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<GraphFlowNode>[]) => {
      // Apply locally for smooth interaction (drag, select, measure, remove).
      setNodes((prev) => applyNodeChanges(changes, prev));
      // Commit structural removes to the store so the document stays in sync.
      for (const change of changes) {
        if (change.type === "remove") {
          apply({ type: "removeNode", id: change.id });
        }
      }
    },
    [apply, setNodes],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<GraphFlowEdge>[]) => {
      setEdges((prev) => applyEdgeChanges(changes, prev));
      for (const change of changes) {
        if (change.type === "remove") {
          apply({ type: "removeEdge", id: change.id });
        }
      }
    },
    [apply, setEdges],
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      apply({
        type: "addEdge",
        edge: {
          id: crypto.randomUUID(),
          source: connection.source,
          target: connection.target,
          type: "references",
          data: {},
        },
      });
    },
    [apply],
  );

  // Commit positions only when the drag ends, not on every drag tick.
  const handleNodeDragStop = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      _node: GraphFlowNode,
      dragged: GraphFlowNode[],
    ) => {
      apply({
        type: "moveNodes",
        moves: dragged.map((node) => ({ id: node.id, position: node.position })),
      });
    },
    [apply],
  );

  // Mirror React Flow's selection into the store's EPHEMERAL selection. Never
  // written into the document.
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      setSelection({
        nodeId: selectedNodes[0]?.id,
        edgeId: selectedEdges[0]?.id,
      });
    },
    [setSelection],
  );

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode={flowColorMode}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleSelectionChange}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          setSelection({ nodeId: node.id, edgeId: undefined });
          onContextMenu({
            kind: "node",
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
          });
        }}
        onEdgeContextMenu={(event, edge) => {
          event.preventDefault();
          setSelection({ nodeId: undefined, edgeId: edge.id });
          onContextMenu({
            kind: "edge",
            x: event.clientX,
            y: event.clientY,
            edgeId: edge.id,
          });
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          onContextMenu({
            kind: "pane",
            x: event.clientX,
            y: event.clientY,
            flowPosition: screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
          });
        }}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
