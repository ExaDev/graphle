/**
 * Styles for the right-click context menu. The {@link ContextMenu} is a
 * controlled Mantine `Menu` whose `Menu.Target` is an invisible 1×1 anchor
 * pinned to the click coordinates. The anchor exists only so Mantine has a
 * positioning reference for the dropdown; it never takes focus or pointer
 * events, so it cannot steal a click from the canvas below it.
 */
import { style } from "@vanilla-extract/css";

/**
 * The invisible anchor. `position: fixed` pins it to the viewport at the click
 * coordinates (set inline from `state.x`/`state.y`), and `pointer-events: none`
 * keeps it from intercepting canvas interaction. The menu is rendered in
 * {@link AppShell}, outside React Flow's transformed viewport, so the fixed
 * positioning is relative to the true viewport rather than the canvas transform.
 */
export const invisibleTarget = style({
  position: "fixed",
  width: 1,
  height: 1,
  pointerEvents: "none",
  opacity: 0,
});
