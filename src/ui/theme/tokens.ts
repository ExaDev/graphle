/**
 * Design tokens — single source of truth consumed by mantineTheme.ts and,
 * via themeToVars, by vars.css.ts. Kept deliberately small: Mantine's
 * built-in colour scales and spacing/radius system do most of the work, so
 * only the values that diverge from the defaults are named here.
 */

// Primary brand colour — indigo, matches Mantine's built-in "indigo" scale.
export const PRIMARY_COLOUR = "#4263eb";

// Dark-scheme background base.
export const BACKGROUND_DARK = "#1a1b1e";

// Font stacks — straight quotes only (copy-paste-safe).
export const FONT_BODY = "system-ui, -apple-system, 'Segoe UI', sans-serif";
export const FONT_MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

// Default component corner radius.
export const APP_RADIUS = "md";
