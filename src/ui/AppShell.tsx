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
 * stays in sync with the document for every descendant edit. `useAutosave`,
 * `useGistAutoSync`, `useGithubFileAutoSync`, and `useTypeLibraryAutoSync` are
 * mounted alongside it for the same reason: all are mount-time hooks with no
 * JSX of their own that need to observe every document (or type library)
 * change regardless of which descendant panel is open.
 */
import {
  ActionIcon,
  Anchor,
  AppShell as MantineAppShell,
  Badge,
  Box,
  Button,
  Group,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconAdjustmentsHorizontal,
  IconBrandGithub,
  IconArrowsSplit2,
  IconCategory,
  IconHistory,
  IconLink,
  IconPlus,
  IconStack2,
  IconTemplate,
} from "@tabler/icons-react";
import { ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";

import { alignNodes, connectedNodeIds, distributeNodes, type AlignEdge, type DistributeAxis } from "@/domain";
import { expansionsForType } from "@/github";
import { type Position } from "@/schema";
import { buildShareUrl } from "@/sharing/url";
import { useGraphStore } from "@/ui/store/graph-store";

import { buildMeta } from "./buildMeta";
import { ContextMenu, type ContextMenuState } from "./flow/ContextMenu";
import { GraphCanvas } from "./flow/GraphCanvas";
import { runNodeExpansion } from "./flow/run-node-expansion";
import { AddNodeMenu } from "./panels/AddNodeMenu";
import { EdgeTypeEditorModal } from "./panels/EdgeTypeEditorModal";
import { GistPickerModal } from "./panels/GistPickerModal";
import { GitHubPanel } from "./panels/GitHubPanel";
import { GraphsDrawer } from "./panels/GraphsDrawer";
import { HistoryDrawer } from "./panels/HistoryDrawer";
import { InspectorPanel } from "./panels/InspectorPanel";
import { SyncConflictModal } from "./panels/SyncConflictModal";
import { TypeEditorModal } from "./panels/TypeEditorModal";
import { TypesDrawer } from "./panels/TypesDrawer";
import { ThemeToggle } from "./ThemeToggle";
import { useAutosave } from "./sync/useAutosave";
import { useGistAutoSync } from "./sync/useGistAutoSync";
import { useGithubFileAutoSync } from "./sync/useGithubFileAutoSync";
import { useTypeLibraryAutoSync } from "./sync/useTypeLibraryAutoSync";
import { useUrlSync } from "./sync/useUrlSync";

/** Header height in px. The canvas is sized to fill the viewport below it, so
 *  this constant is the single source for both the header and that calc. */
const HEADER_HEIGHT = 56;

/** Diagonal offset (px) applied to a duplicated node so the copy lands clear of
 *  the original rather than directly on top of it. */
const DUPLICATE_OFFSET_PX = 40;

export function AppShell() {
  useUrlSync();
  useAutosave();
  useGistAutoSync();
  useGithubFileAutoSync();
  useTypeLibraryAutoSync();

  const document = useGraphStore((state) => state.document);
  const dirty = useGraphStore((state) => state.dirty);
  const apply = useGraphStore((state) => state.apply);
  const setSelection = useGraphStore((state) => state.setSelection);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const setSelectedNodeIds = useGraphStore((state) => state.setSelectedNodeIds);
  const undo = useGraphStore((state) => state.undo);
  const redo = useGraphStore((state) => state.redo);
  useHotkeys([
    ["mod+Z", () => undo()],
    ["mod+shift+Z", () => redo()],
  ]);
  // The GitHub drawer's open state lives in the store, not local useDisclosure
  // like the other panels — useUrlSync (a mount-time hook with no JSX of its
  // own) needs to be able to open it to prompt for a PAT, and to attach a
  // pending action to resume once one is validated (see graph-store.ts).
  const githubPanelOpened = useGraphStore((state) => state.githubPanelOpened);
  const openGitHubPanel = useGraphStore((state) => state.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((state) => state.closeGitHubPanel);

  const [addOpened, { open: openAdd, close: closeAddDisclosure }] =
    useDisclosure(false);
  const [typeOpened, { open: openType, close: closeType }] = useDisclosure(false);
  const [edgeTypeOpened, { open: openEdgeType, close: closeEdgeType }] =
    useDisclosure(false);
  const [graphsOpened, { open: openGraphs, close: closeGraphs }] =
    useDisclosure(false);
  const [historyOpened, { open: openHistory, close: closeHistory }] =
    useDisclosure(false);
  const [typesManagerOpened, { open: openTypesManager, close: closeTypesManager }] =
    useDisclosure(false);
  const [inspectorOpened, { toggle: toggleInspector }] = useDisclosure(false);

  // Right-click context menu: open state + the flow position to seed an
  // "Add node here" (cleared once the modal closes, so the toolbar "Add node"
  // falls back to the cascade).
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [addHerePos, setAddHerePos] = useState<Position | undefined>(undefined);

  function closeAdd(): void {
    closeAddDisclosure();
    setAddHerePos(undefined);
  }

  function handleDuplicate(nodeId: string): void {
    const node = document.nodes.find((n) => n.id === nodeId);
    if (node === undefined) return;
    apply({
      type: "addNode",
      node: {
        ...node,
        id: crypto.randomUUID(),
        position: {
          x: node.position.x + DUPLICATE_OFFSET_PX,
          y: node.position.y + DUPLICATE_OFFSET_PX,
        },
      },
    });
  }

  function handleDeleteNode(nodeId: string): void {
    apply({ type: "removeNode", id: nodeId });
    setSelection({ nodeId: undefined, edgeId: undefined });
  }

  function handleDeleteEdge(edgeId: string): void {
    apply({ type: "removeEdge", id: edgeId });
    setSelection({ nodeId: undefined, edgeId: undefined });
  }

  function handleToggleCollapse(nodeId: string): void {
    const node = document.nodes.find((n) => n.id === nodeId);
    if (node === undefined) return;
    apply({ type: "setCollapsed", id: nodeId, collapsed: node.collapsed !== true });
  }

  /** Runs one of a node's GitHub expansions from the context menu — a
   *  one-shot fetch (no pagination tracking, unlike `ExpandMenu`'s own
   *  "Load more"), mirroring the inspector's Expand dropdown. */
  function handleExpandNode(nodeId: string, expansionId: string): void {
    const node = document.nodes.find((n) => n.id === nodeId);
    if (node === undefined) return;
    const expansion = expansionsForType(node.type).find((e) => e.id === expansionId);
    if (expansion === undefined) return;
    void runNodeExpansion(node, expansion, undefined, new AbortController().signal);
  }

  /** Removing a `"group"` node clears its children's `parentId` (see
   *  `removeNode` in `operations.ts`) rather than deleting them — this *is*
   *  ungrouping, no separate operation needed. */
  function handleUngroup(nodeId: string): void {
    apply({ type: "removeNode", id: nodeId });
  }

  /** Duplicates every node in a multi-selection in one undo step (see
   *  `addNodes` in `operations.ts`), offsetting each copy the same way as
   *  a single-node `handleDuplicate`. */
  function handleDuplicateSelection(nodeIds: string[]): void {
    const nodes = document.nodes.filter((n) => nodeIds.includes(n.id));
    if (nodes.length === 0) return;
    apply({
      type: "addNodes",
      nodes: nodes.map((node) => ({
        ...node,
        id: crypto.randomUUID(),
        position: {
          x: node.position.x + DUPLICATE_OFFSET_PX,
          y: node.position.y + DUPLICATE_OFFSET_PX,
        },
      })),
    });
  }

  /** Deletes every node in a multi-selection in one undo step (see
   *  `removeNodes` in `operations.ts`) and clears both the single-item
   *  selection and the multi-select list, since none of those ids remain
   *  in the document. */
  function handleDeleteSelection(nodeIds: string[]): void {
    apply({ type: "removeNodes", ids: nodeIds });
    setSelection({ nodeId: undefined, edgeId: undefined });
    setSelectedNodeIds([]);
  }

  function handleGroupSelection(nodeIds: string[]): void {
    if (nodeIds.length === 0) return;
    const selected = document.nodes.filter((n) => nodeIds.includes(n.id));
    const centroid = selected.reduce(
      (sum, n) => ({ x: sum.x + n.position.x, y: sum.y + n.position.y }),
      { x: 0, y: 0 },
    );
    apply({
      type: "groupNodes",
      groupId: crypto.randomUUID(),
      label: "Group",
      childIds: nodeIds,
      position: { x: centroid.x / selected.length, y: centroid.y / selected.length },
    });
  }

  /** Snaps every node in `nodeIds` to a shared edge/centre line in one undo
   *  step (see `alignNodes` in `align.ts`). */
  function handleAlignSelection(nodeIds: string[], edge: AlignEdge): void {
    const nodes = document.nodes.filter((n) => nodeIds.includes(n.id));
    if (nodes.length === 0) return;
    apply({ type: "moveNodes", moves: alignNodes(nodes, edge) });
  }

  /** Spaces every node in `nodeIds` evenly along one axis in one undo step
   *  (see `distributeNodes` in `align.ts`). */
  function handleDistributeSelection(nodeIds: string[], axis: DistributeAxis): void {
    const nodes = document.nodes.filter((n) => nodeIds.includes(n.id));
    if (nodes.length === 0) return;
    apply({ type: "moveNodes", moves: distributeNodes(nodes, axis) });
  }

  /** Selects every node reachable from `nodeId` by following edges in
   *  either direction (see `connectedNodeIds` in `reachability.ts`). The
   *  canvas's own selection-sync effect applies the visual highlight from
   *  `selectedNodeIds`, so no React Flow state needs touching here. */
  function handleSelectConnected(nodeId: string): void {
    setSelectedNodeIds(connectedNodeIds(nodeId, document));
  }

  function handleAddHere(): void {
    if (ctxMenu?.flowPosition === undefined) return;
    setAddHerePos(ctxMenu.flowPosition);
    openAdd();
  }

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
            leftSection={<IconTemplate size={16} />}
            onClick={openType}
          >
            <Box component="span" visibleFrom="sm">
              New type
            </Box>
          </Button>

          <Button
            variant="default"
            size="xs"
            leftSection={<IconArrowsSplit2 size={16} />}
            onClick={openEdgeType}
          >
            <Box component="span" visibleFrom="sm">
              New edge type
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
            onClick={() => openGitHubPanel()}
          >
            <IconBrandGithub size={16} />
          </ActionIcon>

          <ActionIcon
            variant="default"
            size="lg"
            aria-label="History"
            onClick={openHistory}
          >
            <IconHistory size={16} />
          </ActionIcon>

          <ActionIcon
            variant="default"
            size="lg"
            aria-label="Manage types"
            onClick={openTypesManager}
          >
            <IconCategory size={16} />
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

          {buildMeta !== undefined && (
            <Tooltip label={buildMeta.title} position="bottom" withArrow openDelay={200}>
              <Anchor
                size="xs"
                c="dimmed"
                href={buildMeta.href}
                target="_blank"
                rel="noreferrer noopener"
                visibleFrom="sm"
              >
                {buildMeta.label}
              </Anchor>
            </Tooltip>
          )}
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Main>
        {/* React Flow forces `height: 100%` on its root, which does not resolve
         *  against a flex-derived parent height. Give the canvas a definite
         *  viewport height so the 100% has something concrete to fill. */}
        <div style={{ height: `calc(100dvh - ${HEADER_HEIGHT}px)` }}>
          <ReactFlowProvider>
            <GraphCanvas onContextMenu={setCtxMenu} />
          </ReactFlowProvider>
        </div>
      </MantineAppShell.Main>

      <MantineAppShell.Aside p="xs">
        <MantineAppShell.Section grow>
          <InspectorPanel />
        </MantineAppShell.Section>
      </MantineAppShell.Aside>

      <AddNodeMenu
        opened={addOpened}
        onClose={closeAdd}
        initialPosition={addHerePos}
      />
      <TypeEditorModal opened={typeOpened} onClose={closeType} />
      <EdgeTypeEditorModal opened={edgeTypeOpened} onClose={closeEdgeType} />
      <GitHubPanel opened={githubPanelOpened} onClose={closeGitHubPanel} />
      <GraphsDrawer opened={graphsOpened} onClose={closeGraphs} />
      <HistoryDrawer opened={historyOpened} onClose={closeHistory} />
      <TypesDrawer opened={typesManagerOpened} onClose={closeTypesManager} />
      <GistPickerModal />
      <SyncConflictModal />
      <ContextMenu
        state={ctxMenu}
        onClose={() => setCtxMenu(null)}
        onDuplicate={handleDuplicate}
        onDeleteNode={handleDeleteNode}
        onDeleteEdge={handleDeleteEdge}
        onSelectNode={(nodeId) =>
          setSelection({ nodeId, edgeId: undefined })
        }
        onSelectEdge={(edgeId) =>
          setSelection({ nodeId: undefined, edgeId })
        }
        onSelectConnected={handleSelectConnected}
        onAddHere={handleAddHere}
        selectedNodeIds={selectedNodeIds}
        onGroupSelection={handleGroupSelection}
        onDuplicateSelection={handleDuplicateSelection}
        onDeleteSelection={handleDeleteSelection}
        onAlignSelection={handleAlignSelection}
        onDistributeSelection={handleDistributeSelection}
        onToggleCollapse={handleToggleCollapse}
        onUngroup={handleUngroup}
        onExpand={handleExpandNode}
      />
    </MantineAppShell>
  );
}
