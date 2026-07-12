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
import { useHotkeys } from "@mantine/hooks";
import { IconArrowAutofitDown, IconArrowAutofitRight } from "@tabler/icons-react";
import {
  Background,
  ControlButton,
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

import { descendantIds } from "@/domain";
import { useGraphStore } from "@/ui/store/graph-store";

import { computeAutoLayout, type NodeSize } from "./auto-layout";
import { type ContextMenuState } from "./ContextMenu";
import { documentToFlow, type GraphFlowEdge, type GraphFlowNode } from "./to-flow";
import { nodeTypes } from "./type-presentation";

// Fallback footprint for a node React Flow hasn't measured yet (the brief
// window right after it's added, before first paint) — layout still needs
// some size to rank and space it, and this is close to GenericNode's typical
// rendered size.
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 80;

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
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
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
  // changes — an add, remove, inspector data edit, external document load, or
  // a subgraph change (setParent/setCollapsed/groupNodes, see hierarchy.ts) —
  // but never on position-only commits, so a drag-stop does not blow away
  // React Flow's live state. Positions are deliberately excluded from the
  // fingerprint; ids, types, data, parentId, collapsed, relation and label
  // are included, so edits made in the inspector (or a collapse toggle)
  // reach the canvas without re-syncing mid-drag. The
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
      .map((n) => `${n.id}:${n.type}:${String(n.parentId)}:${String(n.collapsed)}:${JSON.stringify(n.data)}`)
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

  // Commit positions only when the drag ends, not on every drag tick. A
  // dragged node that is collapsed (has hidden descendants — see
  // `to-flow.ts`) carries them along by the same delta, so they aren't left
  // stale relative to it and don't reappear somewhere unexpected once
  // expanded again. Hidden descendants are never in React Flow's own local
  // node array (they're filtered out of `documentToFlow`'s projection), so
  // this reads their pre-drag positions from the store's document, the only
  // place they still exist while hidden.
  const handleNodeDragStop = useCallback(
    (
      _event: MouseEvent | TouchEvent,
      _node: GraphFlowNode,
      dragged: GraphFlowNode[],
    ) => {
      const moves: Array<{ id: string; position: { x: number; y: number } }> = [];
      for (const draggedNode of dragged) {
        moves.push({ id: draggedNode.id, position: draggedNode.position });
        const original = graphDocument.nodes.find((node) => node.id === draggedNode.id);
        if (original === undefined || original.collapsed !== true) continue;
        const delta = {
          x: draggedNode.position.x - original.position.x,
          y: draggedNode.position.y - original.position.y,
        };
        for (const descendantId of descendantIds(draggedNode.id, graphDocument.nodes)) {
          const descendant = graphDocument.nodes.find((node) => node.id === descendantId);
          if (descendant === undefined) continue;
          moves.push({
            id: descendantId,
            position: { x: descendant.position.x + delta.x, y: descendant.position.y + delta.y },
          });
        }
      }
      apply({ type: "moveNodes", moves });
    },
    [apply, graphDocument],
  );

  // Runs dagre's deterministic layout over the currently VISIBLE nodes/edges
  // (`nodes`/`edges` are already `documentToFlow`'s hidden-filtered,
  // boundary-rerouted projection), then folds the result into one
  // `moveNodes` call — a single undo step. A collapsed node's hidden
  // descendants aren't in `nodes` (dagre never sees or sizes them), so they
  // are translated by the same delta as their visible parent, exactly
  // mirroring `handleNodeDragStop`'s treatment of a dragged collapsed node,
  // so they aren't left stale relative to it.
  const handleAutoLayout = useCallback(
    (direction: "TB" | "LR") => {
      const sizes = new Map<string, NodeSize>(
        nodes.map((node) => [
          node.id,
          {
            width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
            height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
          },
        ]),
      );
      const layout = computeAutoLayout(nodes, edges, sizes, direction);

      const moves: Array<{ id: string; position: { x: number; y: number } }> = [];
      for (const node of nodes) {
        const position = layout.get(node.id);
        if (position === undefined) continue;
        moves.push({ id: node.id, position });

        const original = graphDocument.nodes.find((docNode) => docNode.id === node.id);
        if (original === undefined || original.collapsed !== true) continue;
        const delta = { x: position.x - original.position.x, y: position.y - original.position.y };
        for (const descendantId of descendantIds(node.id, graphDocument.nodes)) {
          const descendant = graphDocument.nodes.find((docNode) => docNode.id === descendantId);
          if (descendant === undefined) continue;
          moves.push({
            id: descendantId,
            position: { x: descendant.position.x + delta.x, y: descendant.position.y + delta.y },
          });
        }
      }
      apply({ type: "moveNodes", moves });
    },
    [apply, graphDocument, nodes, edges],
  );

  // Mirror React Flow's selection into the store's EPHEMERAL selection. Never
  // written into the document. `selectedNodeIds` carries the full multi
  // -select list (for bulk actions like "Group"); `selection` stays
  // single-item, for the inspector.
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      setSelection({
        nodeId: selectedNodes[0]?.id,
        edgeId: selectedEdges[0]?.id,
      });
      setSelectedNodeIds(selectedNodes.map((node) => node.id));
    },
    [setSelection, setSelectedNodeIds],
  );

  // Selects every currently visible node — `nodes` is already the
  // post-documentToFlow visible set, so a node hidden by a collapsed
  // ancestor is correctly excluded, matching what's selectable by hand.
  // Flips React Flow's own local `selected` flag (for the visual highlight)
  // alongside the store mirrors `handleSelectionChange` also updates.
  useHotkeys([
    [
      "mod+A",
      () => {
        setNodes((prev) => prev.map((node) => ({ ...node, selected: true })));
        setSelectedNodeIds(nodes.map((node) => node.id));
        setSelection({ nodeId: nodes[0]?.id, edgeId: undefined });
      },
    ],
  ]);

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
            nodeChildCount: node.data.childCount,
            nodeType: node.data.type,
            ...(node.data.collapsed !== undefined ? { nodeCollapsed: node.data.collapsed } : {}),
          });
        }}
        onSelectionContextMenu={(event, selectedNodes) => {
          // React Flow draws a `nodesselection-rect` overlay on top of a 2+
          // multi-selection (to drag the whole group at once), which
          // intercepts the right-click before it ever reaches an individual
          // node — so `onNodeContextMenu` never fires for a multi-selected
          // node. This dedicated callback is the only way to catch that
          // right-click; the target id only needs to be a member of
          // `selectedNodeIds` for ContextMenu's multi-select branch to
          // render, so the first selected node stands in for the whole group.
          event.preventDefault();
          const first = selectedNodes[0];
          if (first === undefined) return;
          onContextMenu({
            kind: "node",
            x: event.clientX,
            y: event.clientY,
            nodeId: first.id,
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
        <Controls>
          <ControlButton title="Layout top-to-bottom" onClick={() => handleAutoLayout("TB")}>
            <IconArrowAutofitDown />
          </ControlButton>
          <ControlButton title="Layout left-to-right" onClick={() => handleAutoLayout("LR")}>
            <IconArrowAutofitRight />
          </ControlButton>
        </Controls>
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
