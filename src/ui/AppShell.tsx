/**
 * Application shell: a Mantine {@link AppShell} with a header toolbar, a
 * responsive inspector aside, and the graph canvas as the main content.
 *
 * Responsive behaviour is driven entirely by Mantine's breakpoint system
 * (visibleFrom/hiddenFrom + the aside's `breakpoint`/`collapsed` config), so
 * there is no JS media query: below `sm` the inspector aside collapses into a
 * slide-over overlay (toggled from the header) and header button labels hide,
 * leaving icon-only controls.
 *
 * `useUrlSync` is mounted here, high in the tree, so the `#g=` share fragment
 * stays in sync with the document for every descendant edit.
 */
import {
  ActionIcon,
  AppShell as MantineAppShell,
  Badge,
  Box,
  Button,
  Group,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal,
  IconBrandGithub,
  IconLink,
  IconPlus,
  IconStack2,
} from "@tabler/icons-react";
import { ReactFlowProvider } from "@xyflow/react";

import { buildShareUrl } from "@/sharing/url";
import { useGraphStore } from "@/ui/store/graph-store";

import { GraphCanvas } from "./flow/GraphCanvas";
import { AddNodeMenu } from "./panels/AddNodeMenu";
import { GitHubPanel } from "./panels/GitHubPanel";
import { GraphsDrawer } from "./panels/GraphsDrawer";
import { InspectorPanel } from "./panels/InspectorPanel";
import { ThemeToggle } from "./ThemeToggle";
import { useUrlSync } from "./sync/useUrlSync";

/** Header height in px. The canvas is sized to fill the viewport below it, so
 *  this constant is the single source for both the header and that calc. */
const HEADER_HEIGHT = 56;

export function AppShell() {
  useUrlSync();

  const document = useGraphStore((state) => state.document);
  const dirty = useGraphStore((state) => state.dirty);
  const apply = useGraphStore((state) => state.apply);

  const [addOpened, { open: openAdd, close: closeAdd }] = useDisclosure(false);
  const [graphsOpened, { open: openGraphs, close: closeGraphs }] =
    useDisclosure(false);
  const [githubOpened, { open: openGitHub, close: closeGitHub }] =
    useDisclosure(false);
  const [inspectorOpened, { toggle: toggleInspector }] = useDisclosure(false);

  async function handleCopyShareUrl(): Promise<void> {
    try {
      await navigator.clipboard.writeText(buildShareUrl(document));
      notifications.show({ message: "Share URL copied to clipboard" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not copy URL: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  return (
    <MantineAppShell
      header={{ height: HEADER_HEIGHT }}
      aside={{
        width: 320,
        breakpoint: "sm",
        collapsed: { mobile: !inspectorOpened, desktop: false },
      }}
      padding={0}
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" gap="sm" wrap="nowrap">
          <Box flex={1} miw={80} maw={360}>
            <TextInput
              size="xs"
              variant="filled"
              aria-label="Graph name"
              value={document.name}
              onChange={(event) =>
                apply({ type: "renameGraph", name: event.currentTarget.value })
              }
            />
          </Box>

          <Badge
            color={dirty ? "red" : "green"}
            variant="dot"
            aria-label={dirty ? "Unsaved changes" : "Saved"}
          >
            {dirty ? "Unsaved" : "Saved"}
          </Badge>

          <Button
            variant="default"
            size="xs"
            leftSection={<IconPlus size={16} />}
            onClick={openAdd}
          >
            <Box component="span" visibleFrom="sm">
              Add node
            </Box>
          </Button>

          <Button
            variant="default"
            size="xs"
            leftSection={<IconLink size={16} />}
            onClick={() => void handleCopyShareUrl()}
          >
            <Box component="span" visibleFrom="sm">
              Copy share URL
            </Box>
          </Button>

          <Button
            variant="default"
            size="xs"
            leftSection={<IconStack2 size={16} />}
            onClick={openGraphs}
          >
            <Box component="span" visibleFrom="sm">
              Graphs
            </Box>
          </Button>

          <ActionIcon
            variant="default"
            size="lg"
            aria-label="GitHub"
            onClick={openGitHub}
          >
            <IconBrandGithub size={16} />
          </ActionIcon>

          <ThemeToggle />

          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Inspector"
            hiddenFrom="sm"
            onClick={toggleInspector}
          >
            <IconAdjustmentsHorizontal size={16} />
          </ActionIcon>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Main>
        {/* React Flow forces `height: 100%` on its root, which does not resolve
         *  against a flex-derived parent height. Give the canvas a definite
         *  viewport height so the 100% has something concrete to fill. */}
        <div style={{ height: `calc(100dvh - ${HEADER_HEIGHT}px)` }}>
          <ReactFlowProvider>
            <GraphCanvas />
          </ReactFlowProvider>
        </div>
      </MantineAppShell.Main>

      <MantineAppShell.Aside p="xs">
        <MantineAppShell.Section grow>
          <InspectorPanel onOpenGitHub={openGitHub} />
        </MantineAppShell.Section>
      </MantineAppShell.Aside>

      <AddNodeMenu opened={addOpened} onClose={closeAdd} />
      <GitHubPanel opened={githubOpened} onClose={closeGitHub} />
      <GraphsDrawer opened={graphsOpened} onClose={closeGraphs} />
    </MantineAppShell>
  );
}
