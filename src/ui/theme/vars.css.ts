import { themeToVars } from "@mantine/vanilla-extract";
import { mantineTheme } from "./mantineTheme";

/**
 * Typed CSS-variable object mirroring the Mantine theme. Import this from
 * any other .css.ts file (e.g. `import { vars } from "./vars.css"`) to
 * reference theme values — colours, spacing, radii, fonts — without ever
 * hard-coding a literal.
 */
export const vars = themeToVars(mantineTheme);
