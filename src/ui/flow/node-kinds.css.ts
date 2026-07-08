/**
 * Colocated styles for the per-kind graph nodes. One accent colour per kind
 * (freeform: gray, org: blue, repo: grape, issue: orange, project: teal),
 * sourced from the Mantine theme via `vars` so light/dark scheme handling and
 * the design-token single source of truth are respected. No literal colours.
 */
import { style } from "@vanilla-extract/css";

import type { NodeKind } from "@/schema";
import { vars } from "@/ui/theme/vars.css.ts";

/** Card body shared by every node kind. */
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

/** Primary label text, truncated so long repo/issue names do not stretch the card. */
export const nodeLabel = style({
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});

/** Per-kind accent border colour. */
export const kindBorder: Record<NodeKind, string> = {
  freeform: style({ borderColor: vars.colors.gray[4] }),
  org: style({ borderColor: vars.colors.blue[6] }),
  repo: style({ borderColor: vars.colors.grape[6] }),
  issue: style({ borderColor: vars.colors.orange[6] }),
  project: style({ borderColor: vars.colors.teal[6] }),
};

/** Per-kind icon tint (tabler icons use `currentColor`). */
export const kindIcon: Record<NodeKind, string> = {
  freeform: style({ color: vars.colors.gray[6] }),
  org: style({ color: vars.colors.blue[6] }),
  repo: style({ color: vars.colors.grape[6] }),
  issue: style({ color: vars.colors.orange[6] }),
  project: style({ color: vars.colors.teal[6] }),
};
