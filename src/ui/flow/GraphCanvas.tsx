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
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useMantineColorScheme } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { IconArrowAutofitDown, IconArrowAutofitRight, IconGrid3x3 } from "@tabler/icons-react";
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
import { snapToggleActive } from "./GraphCanvas.css";
import { NodeSearchPalette } from "./NodeSearchPalette";
import { exportCanvasAsPng, exportCanvasAsSvg } from "./snapshot-export";
import { documentToFlow, type GraphFlowEdge, type GraphFlowNode } from "./to-flow";
import { nodeTypes } from "./type-presentation";

// Fallback footprint for a node React Flow hasn't measured yet (the brief
// window right after it's added, before first paint) — layout still needs
// some size to rank and space it, and this is close to GenericNode's typical
// rendered size.
const DEFAULT_NODE_WIDTH = 220;
const DEFAULT_NODE_HEIGHT = 80;

// Grid spacing (px) nodes snap to when snap-to-grid is enabled via the
// Controls toggle below.
const SNAP_GRID_PX = 16;

// Pan/zoom animation duration (ms) for `fitView` when jumping to a node
// chosen from the search palette.
const JUMP_TO_NODE_FIT_DURATION_MS = 300;

/** Imperative export capability exposed to {@link AppShell} via `ref` — the
 *  PNG/SVG export menu items live in AppShell (outside
 *  `<ReactFlowProvider>`), but a correct bounding-box computation for a
 *  graph with grouped/nested nodes needs `useReactFlow().getNodesBounds`
 *  (see `snapshot-export.ts`'s doc comment), which only exists inside this
 *  component. */
export interface GraphCanvasHandle {
  exportAsPng: () => Promise<void>;
  exportAsSvg: () => Promise<void>;
}

export interface GraphCanvasProps {
  /**
   * Fired on a right-click over a node, edge, or the pane. Receives a fully
   * formed {@link ContextMenuState}: for node/edge it carries the target id;
   * for the pane it carries the click converted to flow space (computed here,
   * where `useReactFlow().screenToFlowPosition` is in scope) so the owner can
   * seed an "Add node here" without needing its own React Flow context.
   */
  onContextMenu: (state: ContextMenuState) => void;
  /** Exposes {@link GraphCanvasHandle} to the owner — React 19 supports
   *  `ref` as a plain prop on function components, no `forwardRef` needed. */
  ref?: Ref<GraphCanvasHandle>;
}

export function GraphCanvas({ onContextMenu, ref }: GraphCanvasProps) {
  const graphDocument = useGraphStore((s) => s.document);
  const graphId = useGraphStore((s) => s.graphId);
  const apply = useGraphStore((s) => s.apply);
  const setSelection = useGraphStore((s) => s.setSelection);
  const setSelectedNodeIds = useGraphStore((s) => s.setSelectedNodeIds);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const { fitView, screenToFlowPosition, getNodesBounds } = useReactFlow();
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

  // Snap-to-grid is a drafting preference, not graph data — it never touches
  // the store or the document, so it resets to off on reload and is never
  // shared via the URL.
  const [snapEnabled, setSnapEnabled] = useState(false);

  // Re-sync React Flow from the store when the document changes — an add,
  // remove, inspector data edit, external document load, a subgraph change
  // (setParent/setCollapsed/groupNodes, see hierarchy.ts), or a position
  // commit from anything OTHER than an in-progress drag (auto-layout,
  // align/distribute, undo/redo, a future feature). Position IS part of the
  // fingerprint below, but the effect bails out early while `dragActiveRef`
  // is true, so a live drag's own local state is never fought mid-gesture —
  // once the drag settles (`handleNodesChange` flips the ref back to false
  // on the final non-dragging position change), the next run picks up
  // whatever the drag committed and reconciles harmlessly (the positions
  // already match). Without including position at all, any non-drag
  // `apply({ type: "moveNodes" })` call — auto-layout already had this bug
  // before align/distribute exposed it — would silently never reach the
  // canvas: the store's document would hold the new positions but React
  // Flow's own local `nodes` state, the only thing actually rendered,
  // would never be told to update.
  const prevStructureRef = useRef("");
  // True from the first `dragging: true` position change to the final
  // `dragging: false` one — see the resync effect above and
  // `handleNodesChange` below, the only place this is written.
  const dragActiveRef = useRef(false);
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
    if (dragActiveRef.current) return;
    const nodeSignature = graphDocument.nodes
      .map(
        (n) =>
          `${n.id}:${n.type}:${String(n.parentId)}:${String(n.collapsed)}:${JSON.stringify(n.data)}:${n.position.x}:${n.position.y}`,
      )
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
        // Tracks whether a drag is currently in flight, for the resync effect
        // above: `dragging: true` fires on every tick of an active drag,
        // `dragging: false` on the final settling change — mirrored here so
        // the effect can tell "position changed because of a live drag I
        // already have correct in local state" from "position changed for
        // any other reason, please resync."
        if (change.type === "position") {
          dragActiveRef.current = change.dragging === true;
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
    async (direction: "TB" | "LR") => {
      const sizes = new Map<string, NodeSize>(
        nodes.map((node) => [
          node.id,
          {
            width: node.measured?.width ?? DEFAULT_NODE_WIDTH,
            height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
          },
        ]),
      );
      const layout = await computeAutoLayout(nodes, edges, sizes, direction);

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

  // Tracks whether Alt is currently held, for the alt-drag-subtract marquee
  // gesture below. Modifier state is read from raw window keydown/keyup
  // rather than the selection-change event itself, because
  // `OnSelectionChangeParams` carries no modifier flags. A `blur` listener
  // resets it too: if the window loses focus mid-hold (e.g. an OS-level
  // Alt-Tab), no `keyup` for Alt is ever delivered and the ref would
  // otherwise stay stuck `true`.
  const altHeldRef = useRef(false);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") altHeldRef.current = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") altHeldRef.current = false;
    };
    const handleBlur = () => {
      altHeldRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  // Tracks whether a marquee (selection-box) drag is currently in progress,
  // via React Flow's dedicated `onSelectionStart`/`onSelectionEnd` pane
  // callbacks below — the only reliable way to distinguish a box-drag
  // selection from a plain node/pane click, since both fire through the same
  // `onSelectionChange`. This is what lets alt-drag-subtract apply only to an
  // actual marquee drag: a plain click never fires `onSelectionStart` (it
  // goes through the node's own click handler, not the pane's pointer-move
  // selection-box logic), so alt-held-while-clicking a single node is
  // unaffected and behaves exactly as before.
  const marqueeActiveRef = useRef(false);

  // Mirror React Flow's selection into the store's EPHEMERAL selection. Never
  // written into the document. `selectedNodeIds` carries the full multi
  // -select list (for bulk actions like "Group"); `selection` stays
  // single-item, for the inspector.
  //
  // Alt-drag-subtract: when Alt is held for an actual marquee drag that
  // captured at least one node, the box-selected nodes are REMOVED from the
  // current selection instead of replacing it (React Flow v12's default is
  // shift-drag-to-add; there is no built-in subtract gesture). The current
  // selection is read fresh from the store here rather than depending on a
  // `selectedNodeIds` closure, so this callback's identity (and the
  // `onSelectionChange` prop) never needs to change across selection
  // updates. Known limitation: only node ids are subtracted, matching the
  // store's `selectedNodeIds`; an alt-marquee that also boxes edges still
  // replaces the edge selection normally, since edges have no equivalent
  // multi-select list to subtract against.
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: OnSelectionChangeParams) => {
      if (altHeldRef.current && marqueeActiveRef.current && selectedNodes.length > 0) {
        const subtractedIds = new Set(selectedNodes.map((node) => node.id));
        const remainingIds = useGraphStore
          .getState()
          .selectedNodeIds.filter((id) => !subtractedIds.has(id));
        setSelectedNodeIds(remainingIds);
        setSelection({ nodeId: remainingIds[0], edgeId: selectedEdges[0]?.id });
        return;
      }
      setSelection({
        nodeId: selectedNodes[0]?.id,
        edgeId: selectedEdges[0]?.id,
      });
      setSelectedNodeIds(selectedNodes.map((node) => node.id));
    },
    [setSelection, setSelectedNodeIds],
  );

  // Mirror the store's selection back onto React Flow's local `selected`
  // flags, the other direction from `handleSelectionChange` above — so a
  // programmatic `setSelectedNodeIds` call (from outside the canvas, e.g. a
  // panel or hotkey) is reflected as a visual highlight, not just in the
  // store. Setting `selected` via the controlled `nodes` prop does not itself
  // re-fire `onSelectionChange`, so this does not loop back into
  // `handleSelectionChange`. Gated on a ref of the last-applied id list
  // (mirroring `prevStructureRef` above), so a mouse-driven selection —
  // which already carries matching `selected` flags by the time
  // `handleSelectionChange` mirrors it into the store — does not trigger a
  // second, redundant `setNodes`.
  const prevSelectedNodeIdsRef = useRef<string[]>([]);
  useEffect(() => {
    const prevIds = prevSelectedNodeIdsRef.current;
    const unchanged =
      prevIds.length === selectedNodeIds.length &&
      prevIds.every((id, index) => id === selectedNodeIds[index]);
    if (unchanged) return;
    prevSelectedNodeIdsRef.current = selectedNodeIds;
    setNodes((prev) =>
      prev.map((node) => ({ ...node, selected: selectedNodeIds.includes(node.id) })),
    );
  }, [selectedNodeIds]);

  // Selects every currently visible node — `nodes` is already the
  // post-documentToFlow visible set, so a node hidden by a collapsed
  // ancestor is correctly excluded, matching what's selectable by hand. The
  // visual highlight is applied by the effect above, driven by the store
  // update here.
  useHotkeys([
    [
      "mod+A",
      () => {
        setSelectedNodeIds(nodes.map((node) => node.id));
        setSelection({ nodeId: nodes[0]?.id, edgeId: undefined });
      },
    ],
  ]);

  useImperativeHandle(
    ref,
    () => ({
      exportAsPng: () => exportCanvasAsPng(nodes, getNodesBounds),
      exportAsSvg: () => exportCanvasAsSvg(nodes, getNodesBounds),
    }),
    [nodes, getNodesBounds],
  );

  // Pans/zooms to the node chosen from the search palette and selects it, so
  // the inspector opens on it and the selection-sync effect above applies the
  // visual highlight — the same two effects a mouse click on the node itself
  // would produce.
  const handleJumpToNode = useCallback(
    (nodeId: string) => {
      void fitView({ nodes: [{ id: nodeId }], duration: JUMP_TO_NODE_FIT_DURATION_MS });
      setSelectedNodeIds([nodeId]);
      setSelection({ nodeId, edgeId: undefined });
    },
    [fitView, setSelectedNodeIds, setSelection],
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
        onSelectionStart={() => {
          marqueeActiveRef.current = true;
        }}
        onSelectionEnd={() => {
          marqueeActiveRef.current = false;
        }}
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
            ...(node.data.fetchedAt !== undefined ? { nodeFetchedAt: node.data.fetchedAt } : {}),
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
        snapToGrid={snapEnabled}
        snapGrid={[SNAP_GRID_PX, SNAP_GRID_PX]}
        fitView
      >
        <Background />
        <Controls>
          <ControlButton title="Layout top-to-bottom" onClick={() => void handleAutoLayout("TB")}>
            <IconArrowAutofitDown />
          </ControlButton>
          <ControlButton title="Layout left-to-right" onClick={() => void handleAutoLayout("LR")}>
            <IconArrowAutofitRight />
          </ControlButton>
          <ControlButton
            title={snapEnabled ? "Snap to grid on" : "Snap to grid off"}
            className={snapEnabled ? snapToggleActive : undefined}
            aria-pressed={snapEnabled}
            onClick={() => setSnapEnabled((prev) => !prev)}
          >
            <IconGrid3x3 />
          </ControlButton>
        </Controls>
        <MiniMap />
      </ReactFlow>
      <NodeSearchPalette nodes={nodes} onSelectNode={handleJumpToNode} />
    </div>
  );
}
