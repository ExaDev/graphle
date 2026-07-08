import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { mantineTheme } from "./theme/mantineTheme";
import { AppShell } from "./AppShell";

/**
 * Application root. Wires up the Mantine provider (theme + colour-scheme
 * handling) and the global notifications host, then mounts the editor shell.
 * `main.tsx` is the entry point that renders this component; the provider and
 * notifications wrapper live here so the rest of the tree can assume they are
 * available.
 */
export function App() {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <Notifications />
      <AppShell />
    </MantineProvider>
  );
}
