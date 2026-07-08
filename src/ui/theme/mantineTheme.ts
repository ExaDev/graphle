import { createTheme } from "@mantine/core";
import { APP_RADIUS, FONT_BODY, FONT_MONO } from "./tokens";

/**
 * Graphle's Mantine theme. Deliberately thin: "indigo" is one of Mantine's
 * built-in colour scales and already matches PRIMARY_COLOUR, so no custom
 * colorsTuple is required — only the values that diverge from Mantine's
 * defaults are set here.
 */
export const mantineTheme = createTheme({
  primaryColor: "indigo",
  defaultRadius: APP_RADIUS,
  fontFamily: FONT_BODY,
  fontFamilyMonospace: FONT_MONO,
});
