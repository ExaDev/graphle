/**
 * Shared styles for the generic graph node card. There are no per-kind styles
 * any more: every node renders through one {@link GenericNode} component, and
 * the accent colour comes from the node type's `color` via a Mantine CSS
 * variable applied inline (see {@link GenericNode}). Only the structural styles
 * that are identical for every node live here; colour is data-driven.
 */
import { style } from "@vanilla-extract/css";

import { vars } from "@/ui/theme/vars.css.ts";

/** Card body shared by every node. `borderColor` is set inline from the type. */
export const nodeCard = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.spacing.xs,
  padding: `${vars.spacing.sm} ${vars.spacing.md}`,
  borderRadius: vars.radius.md,
  borderWidth: 2,
  borderStyle: "solid",
  background: vars.colors.body,
  minWidth: 168,
  fontSize: vars.fontSizes.sm,
});

/** Icon + primary label row. */
export const nodeHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
});

/** Primary label text, truncated so long names do not stretch the card. */
export const nodeLabel = style({
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** Small "stale" clock badge shown on a GitHub-sourced node whose `fetchedAt`
 *  is older than `STALE_AFTER_MS` (see `node-kinds.tsx`). Sits inline in the
 *  header, pushed to the row's end, dimmed like the collapse toggle so it
 *  reads as a subtle hint rather than a warning. */
export const staleIcon = style({
  marginLeft: "auto",
  flexShrink: 0,
  color: "var(--mantine-color-dimmed)",
});

/** Collapse/expand toggle, shown only on a node with at least one child
 *  (`data.childCount > 0` — see `to-flow.ts`). */
export const collapseToggle = style({
  display: "flex",
  alignItems: "center",
  gap: vars.spacing.xs,
  alignSelf: "flex-start",
  cursor: "pointer",
  border: "none",
  background: "none",
  padding: 0,
  color: "var(--mantine-color-dimmed)",
  fontSize: vars.fontSizes.xs,
});
