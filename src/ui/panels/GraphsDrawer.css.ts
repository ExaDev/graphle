/**
 * Colocated styles for {@link GraphsDrawer}. The saved-graph row picks up a
 * subtle primary tint when it is the currently open graph; both the tint and
 * the corner radius come from the Mantine theme via `vars`, so no literal
 * colours or numbers are hard-coded.
 */
import { style } from "@vanilla-extract/css";

import { vars } from "@/ui/theme/vars.css.ts";

/** Base row chrome shared by every saved-graph entry. */
export const graphRow = style({
  borderRadius: vars.radius.md,
});

/** Tint applied (in addition to {@link graphRow}) to the open graph's row. */
export const selectedGraphRow = style({
  background: vars.colors.indigo[1],
});
