/**
 * Right-click context menu for the React Flow canvas, offering per-target
 * actions (duplicate/select/delete for nodes, select/delete for edges, and
 * "Add node here" for the pane).
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
  IconCopy,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { CSSProperties } from "react";

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
  /** Open the add-node modal seeded with the pane click's flow position. */
  onAddHere: () => void;
}

export function ContextMenu({
  state,
  onClose,
  onDuplicate,
  onDeleteNode,
  onDeleteEdge,
  onSelectNode,
  onSelectEdge,
  onAddHere,
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
        {state?.kind === "node" && (
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
          <Menu.Item leftSection={<IconPlus size={14} />} onClick={onAddHere}>
            Add node here
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
