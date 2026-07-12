/**
 * Colocated styles for {@link GraphCanvas}. The snap-to-grid control button
 * picks up a subtle primary tint while snapping is enabled, mirroring the
 * "current selection" tint pattern used elsewhere (e.g. `GraphsDrawer`'s
 * open-graph row) — the tint comes from the Mantine theme via `vars`, so no
 * literal colour is hard-coded.
 */
import { style } from "@vanilla-extract/css";

import { vars } from "@/ui/theme/vars.css.ts";

/** Applied to the snap-to-grid `ControlButton` while snapping is enabled. */
export const snapToggleActive = style({
  background: vars.colors.indigo[1],
});
