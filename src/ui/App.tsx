import { Center, MantineProvider, Title } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { mantineTheme } from "./theme/mantineTheme";

/**
 * Application root. Wires up the Mantine provider (theme + colour-scheme
 * handling) and the global notifications host. Everything below this is
 * placeholder pending the real graph canvas.
 */
export function App() {
  return (
    <MantineProvider theme={mantineTheme} defaultColorScheme="auto">
      <Notifications />
      <Center h="100vh">
        <Title order={1}>Graphle</Title>
      </Center>
    </MantineProvider>
  );
}
