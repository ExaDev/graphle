/**
 * Right-click context menu for the React Flow canvas, offering per-target
 * actions (duplicate/select/delete for nodes, select/delete for edges, and
 * "Add node here" for the pane) — plus subgraph actions: right-clicking a
 * node that's part of a 2+ multi-selection (`selectedNodeIds`) shows
 * "Group"/"Duplicate"/"Delete N nodes" instead of the normal single-node
 * menu, plus one entry per expansion common to every distinct type in the
 * selection (`commonSelectionExpansions`, computed by {@link AppShell} — this
 * component has no document access of its own); a node whose type has GitHub
 * expansions (`expansionsForType`, e.g. a repo's Issues/Pull requests/
 * Projects) gets one entry per expansion, mirroring the inspector's
 * `ExpandMenu`; a node with children
 * (`state.nodeChildCount > 0` — see `GraphNode.parentId`/`collapsed` in
 * `src/schema/node.ts`) gets a Collapse/Expand entry; a `"group"`-typed node
 * additionally gets "Ungroup".
 *
 * The menu is CONTROLLED: {@link AppShell} owns the {@link ContextMenuState}
 * and renders this component with `state` set when a context-menu event fires.
 * Opening is therefore driven entirely by that state (not by clicking the
 * target), which is why the target is an invisible 1×1 anchor that takes no
 * pointer events — it exists only so Mantine has a positioning reference.
 *
 * The dropdown renders inside a portal (`withinPortal`) so it escapes React
 * Flow's transformed viewport; without it, the dropdown would inherit the
 * canvas pan/zoom transform and render in the wrong place. Closing happens on
 * item click, outside click, and Escape, all routed through `onClose` so the
 * owner can clear the state.
 */
import { Divider, Menu } from "@mantine/core";
import {
  IconAffiliate,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFolderOpen,
  IconGhost2,
  IconLayoutAlignBottom,
  IconLayoutAlignLeft,
  IconLayoutAlignRight,
  IconLayoutAlignTop,
  IconLayoutDistributeHorizontal,
  IconLayoutDistributeVertical,
  IconPencil,
  IconPlaylistAdd,
  IconPlus,
  IconStack2,
  IconTrash,
} from "@tabler/icons-react";
import type { CSSProperties } from "react";

import type { AlignEdge, DistributeAxis } from "@/domain";
import { expansionsForType, type Expansion } from "@/github";
import type { Position } from "@/schema";

import { invisibleTarget } from "./ContextMenu.css";

/** What was right-clicked. */
export type ContextMenuKind = "node" | "edge" | "pane";

/**
 * Everything the context menu needs to render and act: the target kind, the
 * screen coordinates of the click (to position the invisible anchor), the id of
 * the targeted node or edge, and — for pane clicks only — the click converted to
 * flow space, passed to "Add node here".
 *
 * The optional fields carry a value only for the kind that owns them
 * (`nodeId` for nodes, `edgeId` for edges, `flowPosition` for the pane). Under
 * `exactOptionalPropertyTypes` they are simply absent otherwise, never set to
 * `undefined`.
 */
export interface ContextMenuState {
  kind: ContextMenuKind;
  /** Viewport-relative x of the click; positions the invisible anchor. */
  x: number;
  /** Viewport-relative y of the click; positions the invisible anchor. */
  y: number;
  /** Present only when `kind === "node"`. */
  nodeId?: string;
  /** Present only when `kind === "edge"`. */
  edgeId?: string;
  /** Present only when `kind === "pane"`; the flow-space click position. */
  flowPosition?: Position;
  /** Present only when `kind === "node"`: how many children it has (0 for
   *  none) — see `GraphFlowNode.data.childCount` in `to-flow.ts`. */
  nodeChildCount?: number;
  /** Present only when `kind === "node"` and it has children: whether
   *  they're currently hidden. */
  nodeCollapsed?: boolean;
  /** Present only when `kind === "node"`: its graphle type name, so a
   *  `"group"` node can additionally offer "Ungroup". */
  nodeType?: string;
}

export interface ContextMenuProps {
  /** The menu is open when non-null, closed when null. */
  state: ContextMenuState | null;
  /** Cleared by the owner to close the menu (item click, outside, Escape). */
  onClose: () => void;
  onDuplicate: (nodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string) => void;
  /** Select every node reachable from `nodeId` by following edges in either
   *  direction (see `connectedNodeIds` in `reachability.ts`). */
  onSelectConnected: (nodeId: string) => void;
  /** Open the add-node modal seeded with the pane click's flow position. */
  onAddHere: () => void;
  /** Select every node with no edge touching it. */
  onSelectOrphans: () => void;
  /** The canvas's current multi-selected node ids — read-only here, used
   *  only to decide whether right-clicking shows the bulk
   *  Group/Duplicate/Delete entries instead of the normal single-node menu. */
  selectedNodeIds: string[];
  /** Group every id in `nodeIds` under a new `"group"` node. */
  onGroupSelection: (nodeIds: string[]) => void;
  /** Duplicate every id in `nodeIds` in one undo step. */
  onDuplicateSelection: (nodeIds: string[]) => void;
  /** Delete every id in `nodeIds` in one undo step. */
  onDeleteSelection: (nodeIds: string[]) => void;
  /** Snap every id in `nodeIds` to a shared edge/centre line in one undo
   *  step (see `alignNodes` in `align.ts`). */
  onAlignSelection: (nodeIds: string[], edge: AlignEdge) => void;
  /** Space every id in `nodeIds` evenly along one axis in one undo step
   *  (see `distributeNodes` in `align.ts`). */
  onDistributeSelection: (nodeIds: string[], axis: DistributeAxis) => void;
  /** The expansions available to run across the entire multi-selection: the
   *  intersection, by `Expansion.id`, of `expansionsForType` across every
   *  distinct type present in `selectedNodeIds` — computed by the owner
   *  since this component has no document access. Empty for a heterogeneous
   *  selection whose types share no expansion id, which is correct: there is
   *  nothing valid to run in bulk. */
  commonSelectionExpansions: Expansion[];
  /** Toggle a node's `collapsed` state. */
  onToggleCollapse: (nodeId: string) => void;
  /** Remove a `"group"`-typed node, promoting its children back to
   *  top-level rather than deleting them. */
  onUngroup: (nodeId: string) => void;
  /** Run one of the node's available GitHub expansions (see
   *  `expansionsForType`), identified by its `Expansion.id`. */
  onExpand: (nodeId: string, expansionId: string) => void;
  /** Run one of `commonSelectionExpansions`, identified by its `Expansion.id`,
   *  across every id in `nodeIds`. */
  onExpandSelection: (nodeIds: string[], expansionId: string) => void;
}

export function ContextMenu({
  state,
  onClose,
  onDuplicate,
  onDeleteNode,
  onDeleteEdge,
  onSelectNode,
  onSelectEdge,
  onSelectConnected,
  onAddHere,
  onSelectOrphans,
  selectedNodeIds,
  onGroupSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onAlignSelection,
  onDistributeSelection,
  commonSelectionExpansions,
  onToggleCollapse,
  onUngroup,
  onExpand,
  onExpandSelection,
}: ContextMenuProps) {
  // The anchor is only positioned when the menu is open; when closed, no
  // inline coordinates are applied (the 1px box is invisible and pointer-none,
  // so its location is irrelevant). Avoids a sentinel `0` for the closed case.
  const anchorStyle: CSSProperties | undefined =
    state !== null ? { left: state.x, top: state.y } : undefined;

  return (
    <Menu
      opened={state !== null}
      onClose={onClose}
      closeOnClickOutside
      closeOnEscape
      closeOnItemClick
      withinPortal
      position="bottom-start"
    >
      <Menu.Target>
        <div className={invisibleTarget} style={anchorStyle} />
      </Menu.Target>
      <Menu.Dropdown>
        {state?.kind === "node" &&
          state.nodeId !== undefined &&
          selectedNodeIds.length >= 2 &&
          selectedNodeIds.includes(state.nodeId) && (
            <>
              <Menu.Item
                leftSection={<IconStack2 size={14} />}
                onClick={() => onGroupSelection(selectedNodeIds)}
              >
                Group {selectedNodeIds.length} nodes
              </Menu.Item>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={() => onDuplicateSelection(selectedNodeIds)}
              >
                Duplicate {selectedNodeIds.length} nodes
              </Menu.Item>
              <Divider />
              <Menu.Item
                leftSection={<IconLayoutAlignLeft size={14} />}
                onClick={() => onAlignSelection(selectedNodeIds, "left")}
              >
                Align left
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutAlignRight size={14} />}
                onClick={() => onAlignSelection(selectedNodeIds, "right")}
              >
                Align right
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutAlignTop size={14} />}
                onClick={() => onAlignSelection(selectedNodeIds, "top")}
              >
                Align top
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutAlignBottom size={14} />}
                onClick={() => onAlignSelection(selectedNodeIds, "bottom")}
              >
                Align bottom
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutDistributeHorizontal size={14} />}
                onClick={() => onDistributeSelection(selectedNodeIds, "horizontal")}
              >
                Distribute horizontally
              </Menu.Item>
              <Menu.Item
                leftSection={<IconLayoutDistributeVertical size={14} />}
                onClick={() => onDistributeSelection(selectedNodeIds, "vertical")}
              >
                Distribute vertically
              </Menu.Item>
              {commonSelectionExpansions.length > 0 && (
                <>
                  <Divider />
                  {commonSelectionExpansions.map((expansion) => (
                    <Menu.Item
                      key={expansion.id}
                      leftSection={<IconPlaylistAdd size={14} />}
                      onClick={() => onExpandSelection(selectedNodeIds, expansion.id)}
                    >
                      {expansion.label} for {selectedNodeIds.length} nodes
                    </Menu.Item>
                  ))}
                </>
              )}
              <Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => onDeleteSelection(selectedNodeIds)}
              >
                Delete {selectedNodeIds.length} nodes
              </Menu.Item>
            </>
          )}
        {state?.kind === "node" &&
          state.nodeId !== undefined &&
          (selectedNodeIds.length < 2 || !selectedNodeIds.includes(state.nodeId)) && (
            <>
              <Menu.Item
                leftSection={<IconCopy size={14} />}
                onClick={() => {
                  if (state.nodeId !== undefined) onDuplicate(state.nodeId);
                }}
              >
                Duplicate
              </Menu.Item>
              <Menu.Item
                leftSection={<IconPencil size={14} />}
                onClick={() => {
                  if (state.nodeId !== undefined) onSelectNode(state.nodeId);
                }}
              >
                Select
              </Menu.Item>
              <Menu.Item
                leftSection={<IconAffiliate size={14} />}
                onClick={() => {
                  if (state.nodeId !== undefined) onSelectConnected(state.nodeId);
                }}
              >
                Select connected
              </Menu.Item>
              {state.nodeType !== undefined &&
                expansionsForType(state.nodeType).map((expansion) => (
                  <Menu.Item
                    key={expansion.id}
                    leftSection={<IconPlaylistAdd size={14} />}
                    onClick={() => {
                      if (state.nodeId !== undefined) onExpand(state.nodeId, expansion.id);
                    }}
                  >
                    {expansion.label}
                  </Menu.Item>
                ))}
              {state.nodeChildCount !== undefined && state.nodeChildCount > 0 && (
                <Menu.Item
                  leftSection={
                    state.nodeCollapsed === true ? (
                      <IconChevronRight size={14} />
                    ) : (
                      <IconChevronDown size={14} />
                    )
                  }
                  onClick={() => {
                    if (state.nodeId !== undefined) onToggleCollapse(state.nodeId);
                  }}
                >
                  {state.nodeCollapsed === true ? "Expand" : "Collapse"}
                </Menu.Item>
              )}
              {state.nodeType === "group" && (
                <Menu.Item
                  leftSection={<IconFolderOpen size={14} />}
                  onClick={() => {
                    if (state.nodeId !== undefined) onUngroup(state.nodeId);
                  }}
                >
                  Ungroup
                </Menu.Item>
              )}
              <Divider />
              <Menu.Item
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={() => {
                  if (state.nodeId !== undefined) onDeleteNode(state.nodeId);
                }}
              >
                Delete
              </Menu.Item>
            </>
          )}
        {state?.kind === "edge" && (
          <>
            <Menu.Item
              leftSection={<IconPencil size={14} />}
              onClick={() => {
                if (state.edgeId !== undefined) onSelectEdge(state.edgeId);
              }}
            >
              Select
            </Menu.Item>
            <Divider />
            <Menu.Item
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => {
                if (state.edgeId !== undefined) onDeleteEdge(state.edgeId);
              }}
            >
              Delete
            </Menu.Item>
          </>
        )}
        {state?.kind === "pane" && (
          <>
            <Menu.Item leftSection={<IconPlus size={14} />} onClick={onAddHere}>
              Add node here
            </Menu.Item>
            <Divider />
            <Menu.Item leftSection={<IconGhost2 size={14} />} onClick={onSelectOrphans}>
              Select orphan nodes
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
