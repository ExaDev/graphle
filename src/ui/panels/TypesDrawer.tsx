/**
 * Drawer for managing user-defined node/edge types on the current document
 * and the user's personal type library, combining the type editors, the
 * library picker, and remote sync into one place. Three tabs: "Node types"
 * and "Edge types" each list `document.types`/`document.edgeTypes` with
 * per-row Edit/Delete/Save-to-library actions plus an "Add from library"
 * entry point; "Library" shows the library's remote link status and either a
 * linking form (unlinked) or Push/Pull/sync-mode controls (linked).
 *
 * Node/edge type creation itself lives in `AppShell`'s "New node type"/"New
 * edge type" actions (which open {@link TypeEditorModal}/
 * {@link EdgeTypeEditorModal} in create mode) — this drawer only edits
 * existing types, so its own modal instances are always opened with
 * `editing` set to the row being edited.
 *
 * "Save to library" and the Library tab's Push/Pull/link/sync-mode actions
 * all go through `createTypeLibraryStore(db)`, re-read fresh on every write
 * (never trusting a value captured earlier in the render) so a concurrent
 * edit from `LibraryTypePickerModal` or the type editors' "Also save to
 * library" checkbox is never silently clobbered.
 *
 * Push/Pull and the sync-conflict resolution mirror `GraphsDrawer.tsx`'s and
 * `SyncConflictModal.tsx`'s equivalent flows precisely, adapted to a
 * `TypeLibraryDocument` (via `serialiseTypeLibrary`/
 * `fetchGistTypeLibraryRevision`/`fetchGithubBlobTypeLibraryRevision`
 * instead of the graph-document equivalents) and to the singleton
 * `TypeLibrarySyncConflict` in `useTypeLibraryStore` (no `graphId`, since the
 * library isn't scoped to any one graph).
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ActionIcon,
  Button,
  ColorSwatch,
  Divider,
  Drawer,
  Group,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconBookmark,
  IconCloudDownload,
  IconCloudUpload,
  IconLink,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";

import {
  type EdgeTypeDefinition,
  type LinkedRemoteSource,
  type NodeTypeDefinition,
  type StoredTypeLibrary,
  type TypeLibraryDocument,
} from "@/schema";
import { listGistHistory, pushGistFile } from "@/sharing/gist";
import { fetchGithubFileSha, pushGithubFileContent } from "@/sharing/github-file";
import {
  fetchGistTypeLibraryRevision,
  fetchGithubBlobTypeLibraryRevision,
} from "@/sharing/type-library-sync";
import { serialiseTypeLibrary } from "@/sharing/type-library-json";
import { db } from "@/storage/db";
import { createSecretStore } from "@/storage/secret-store-dexie";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";
import { useTypeLibraryStore } from "@/ui/store/type-library-store";

import { EdgeTypeEditorModal } from "./EdgeTypeEditorModal";
import { LibraryTypePickerModal } from "./LibraryTypePickerModal";
import { TypeEditorModal } from "./TypeEditorModal";

export interface TypesDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** The `linkedRemote` shapes this drawer's manual sync actions act on, one
 *  per provider — mirrors `GraphsDrawer`'s identical extraction. */
type GistLinkedRemote = Extract<LinkedRemoteSource, { provider: "gist" }>;
type GithubFileLinkedRemote = Extract<LinkedRemoteSource, { provider: "githubFile" }>;

/** An empty library document, used when none has been saved yet. */
const EMPTY_LIBRARY: TypeLibraryDocument = {
  version: 1,
  nodeTypes: [],
  edgeTypes: [],
};

/** A fresh singleton library row, used as the base for the first save when
 *  none exists yet — the return type annotation lets `id: "library"` narrow
 *  to its literal type without a cast. */
function newStoredLibrary(): StoredTypeLibrary {
  return { id: "library", document: EMPTY_LIBRARY, updatedAt: new Date().toISOString() };
}

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Narrows a Select return value to a remote provider kind without a cast. */
function isProviderKind(value: unknown): value is "gist" | "githubFile" {
  return value === "gist" || value === "githubFile";
}

/** Narrows a Select return value to a sync mode without a cast. */
function isSyncMode(value: unknown): value is "off" | "manual" | "automatic" {
  return value === "off" || value === "manual" || value === "automatic";
}

export function TypesDrawer({ opened, onClose }: TypesDrawerProps) {
  // The store is created once; `db` is a process-wide singleton.
  const store = useMemo(() => createTypeLibraryStore(db), []);
  const stored = useLiveQuery(
    async () => store.get(new AbortController().signal),
    [store],
    undefined,
  );
  const linkedRemote = stored?.linkedRemote;
  const linkedGist: GistLinkedRemote | undefined =
    linkedRemote?.provider === "gist" ? linkedRemote : undefined;
  const linkedGithubFile: GithubFileLinkedRemote | undefined =
    linkedRemote?.provider === "githubFile" ? linkedRemote : undefined;

  const document = useGraphStore((state) => state.document);
  const removeType = useGraphStore((state) => state.removeType);
  const removeEdgeType = useGraphStore((state) => state.removeEdgeType);
  const openGitHubPanel = useGraphStore((state) => state.openGitHubPanel);
  const closeGitHubPanel = useGraphStore((state) => state.closeGitHubPanel);

  const typeLibrarySyncConflict = useTypeLibraryStore((state) => state.syncConflict);
  const setSyncConflict = useTypeLibraryStore((state) => state.setSyncConflict);

  const [nodeEditorOpened, setNodeEditorOpened] = useState(false);
  const [editingNodeType, setEditingNodeType] = useState<NodeTypeDefinition | undefined>(
    undefined,
  );
  const [edgeEditorOpened, setEdgeEditorOpened] = useState(false);
  const [editingEdgeType, setEditingEdgeType] = useState<EdgeTypeDefinition | undefined>(
    undefined,
  );
  const [nodePickerOpened, setNodePickerOpened] = useState(false);
  const [edgePickerOpened, setEdgePickerOpened] = useState(false);

  const [provider, setProvider] = useState<"gist" | "githubFile">("gist");
  const [gistId, setGistId] = useState("");
  const [filename, setFilename] = useState("type-library.json");
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("main");
  const [path, setPath] = useState("type-library.json");
  const [linking, setLinking] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [resolving, setResolving] = useState(false);

  function openNodeTypeEditor(typeDef: NodeTypeDefinition): void {
    setEditingNodeType(typeDef);
    setNodeEditorOpened(true);
  }

  function openEdgeTypeEditor(typeDef: EdgeTypeDefinition): void {
    setEditingEdgeType(typeDef);
    setEdgeEditorOpened(true);
  }

  function handleDeleteNodeType(name: string): void {
    try {
      removeType(name);
      notifications.show({ color: "green", message: `Removed node type "${name}"` });
    } catch (error) {
      notifications.show({ color: "red", message: describe(error) });
    }
  }

  function handleDeleteEdgeType(name: string): void {
    try {
      removeEdgeType(name);
      notifications.show({ color: "green", message: `Removed edge type "${name}"` });
    } catch (error) {
      notifications.show({ color: "red", message: describe(error) });
    }
  }

  /** Append `typeDef` to the persisted node type library, replacing any
   *  existing entry of the same name. */
  async function handleSaveNodeTypeToLibrary(typeDef: NodeTypeDefinition): Promise<void> {
    try {
      const controller = new AbortController();
      const existing = stored ?? newStoredLibrary();
      const nodeTypes = [
        ...existing.document.nodeTypes.filter((entry) => entry.name !== typeDef.name),
        typeDef,
      ];
      const updatedDocument: TypeLibraryDocument = { ...existing.document, nodeTypes };
      await store.save(
        { ...existing, document: updatedDocument, updatedAt: new Date().toISOString() },
        controller.signal,
      );
      notifications.show({
        color: "green",
        message: `Saved "${typeDef.label}" to your type library`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not save to the library: ${describe(error)}`,
      });
    }
  }

  /** Append `typeDef` to the persisted edge type library, replacing any
   *  existing entry of the same name. */
  async function handleSaveEdgeTypeToLibrary(typeDef: EdgeTypeDefinition): Promise<void> {
    try {
      const controller = new AbortController();
      const existing = stored ?? newStoredLibrary();
      const edgeTypes = [
        ...existing.document.edgeTypes.filter((entry) => entry.name !== typeDef.name),
        typeDef,
      ];
      const updatedDocument: TypeLibraryDocument = { ...existing.document, edgeTypes };
      await store.save(
        { ...existing, document: updatedDocument, updatedAt: new Date().toISOString() },
        controller.signal,
      );
      notifications.show({
        color: "green",
        message: `Saved "${typeDef.label}" to your type library`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not save to the library: ${describe(error)}`,
      });
    }
  }

  /** Construct a `LinkedRemoteSource` from the form fields and save it onto
   *  the library, creating the library row if none is saved yet. */
  async function handleLink(): Promise<void> {
    let newRemote: LinkedRemoteSource;
    if (provider === "gist") {
      const trimmedGistId = gistId.trim();
      const trimmedFilename = filename.trim();
      if (trimmedGistId === "" || trimmedFilename === "") {
        notifications.show({ color: "red", message: "Enter a gist ID and filename." });
        return;
      }
      newRemote = {
        provider: "gist",
        gistId: trimmedGistId,
        filename: trimmedFilename,
        syncMode: "manual",
      };
    } else {
      const trimmedOwner = owner.trim();
      const trimmedRepo = repo.trim();
      const trimmedBranch = branch.trim();
      const trimmedPath = path.trim();
      if (
        trimmedOwner === "" ||
        trimmedRepo === "" ||
        trimmedBranch === "" ||
        trimmedPath === ""
      ) {
        notifications.show({
          color: "red",
          message: "Enter the owner, repo, branch, and path.",
        });
        return;
      }
      newRemote = {
        provider: "githubFile",
        owner: trimmedOwner,
        repo: trimmedRepo,
        branch: trimmedBranch,
        path: trimmedPath,
        syncMode: "manual",
      };
    }

    setLinking(true);
    try {
      const controller = new AbortController();
      const existing = stored ?? newStoredLibrary();
      await store.save(
        { ...existing, linkedRemote: newRemote, updatedAt: new Date().toISOString() },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Type library linked" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not link the type library: ${describe(error)}`,
      });
    } finally {
      setLinking(false);
    }
  }

  async function handleSyncModeChange(mode: "off" | "manual" | "automatic"): Promise<void> {
    if (stored === undefined || stored.linkedRemote === undefined) return;
    try {
      const controller = new AbortController();
      const syncedRemote: LinkedRemoteSource = { ...stored.linkedRemote, syncMode: mode };
      await store.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not update the sync mode: ${describe(error)}`,
      });
    }
  }

  /**
   * Push the current library to the linked gist, guarding against a remote
   * that moved since the last recorded sync by reporting a conflict instead
   * of overwriting it — mirrors `GraphsDrawer`'s `pushToGist`.
   */
  async function pushToGist(remote: GistLinkedRemote, token: string): Promise<void> {
    if (stored === undefined) return;
    const controller = new AbortController();
    const history = await listGistHistory(remote.gistId, controller.signal);
    const remoteHead = history[0];
    if (remoteHead === undefined) {
      throw new Error(`Gist ${remote.gistId} has no revision history`);
    }
    if (
      remote.lastSyncedRevision !== undefined &&
      remoteHead.version !== remote.lastSyncedRevision
    ) {
      notifications.show({
        color: "orange",
        message: "The gist has changed since the last sync — pull first, then push.",
      });
      return;
    }
    const newSha = await pushGistFile(
      remote.gistId,
      remote.filename,
      serialiseTypeLibrary(stored.document),
      token,
      controller.signal,
    );
    const syncedRemote: GistLinkedRemote = {
      ...remote,
      lastSyncedRevision: newSha,
      lastSyncedAt: new Date().toISOString(),
    };
    await store.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to gist" });
  }

  async function handlePushToGist(): Promise<void> {
    if (linkedGist === undefined) return;
    setSyncLoading(true);
    try {
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(new AbortController().signal);
      if (token !== undefined) {
        await pushToGist(linkedGist, token);
        return;
      }
      openGitHubPanel(() => {
        secretStore
          .getGitHubToken(new AbortController().signal)
          .then((resumedToken) => {
            if (resumedToken === undefined) return undefined;
            return pushToGist(linkedGist, resumedToken).then(closeGitHubPanel);
          })
          .catch((error: unknown) => {
            notifications.show({
              color: "red",
              message: `Could not push to gist: ${describe(error)}`,
            });
          });
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not push to gist: ${describe(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handlePullFromGist(): Promise<void> {
    if (linkedGist === undefined || stored === undefined) return;
    setSyncLoading(true);
    try {
      const controller = new AbortController();
      const history = await listGistHistory(linkedGist.gistId, controller.signal);
      const remoteHead = history[0];
      if (remoteHead === undefined) {
        throw new Error(`Gist ${linkedGist.gistId} has no revision history`);
      }
      const pulled = await fetchGistTypeLibraryRevision(
        linkedGist.gistId,
        remoteHead.version,
        linkedGist.filename,
        controller.signal,
      );
      const syncedRemote: GistLinkedRemote = {
        ...linkedGist,
        lastSyncedRevision: remoteHead.version,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save(
        { ...stored, document: pulled, linkedRemote: syncedRemote },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Pulled latest from gist" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not pull from gist: ${describe(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  /**
   * Push the current library to the linked repo file, guarding against a
   * remote that moved since the last recorded sync by reporting a conflict
   * instead of overwriting it — mirrors `GraphsDrawer`'s `pushToGithubFile`.
   */
  async function pushToGithubFile(remote: GithubFileLinkedRemote, token: string): Promise<void> {
    if (stored === undefined) return;
    const controller = new AbortController();
    const currentSha = await fetchGithubFileSha(
      remote.owner,
      remote.repo,
      remote.branch,
      remote.path,
      token,
      controller.signal,
    );
    if (remote.lastSyncedRevision !== undefined && currentSha !== remote.lastSyncedRevision) {
      notifications.show({
        color: "orange",
        message: "The repo file has changed since the last sync — pull first, then push.",
      });
      return;
    }
    const newSha = await pushGithubFileContent(
      remote.owner,
      remote.repo,
      remote.branch,
      remote.path,
      serialiseTypeLibrary(stored.document),
      currentSha,
      token,
      controller.signal,
    );
    const syncedRemote: GithubFileLinkedRemote = {
      ...remote,
      lastSyncedRevision: newSha,
      lastSyncedAt: new Date().toISOString(),
    };
    await store.save({ ...stored, linkedRemote: syncedRemote }, controller.signal);
    notifications.show({ color: "green", message: "Pushed to repo file" });
  }

  async function handlePushToGithubFile(): Promise<void> {
    if (linkedGithubFile === undefined) return;
    setSyncLoading(true);
    try {
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(new AbortController().signal);
      if (token !== undefined) {
        await pushToGithubFile(linkedGithubFile, token);
        return;
      }
      openGitHubPanel(() => {
        secretStore
          .getGitHubToken(new AbortController().signal)
          .then((resumedToken) => {
            if (resumedToken === undefined) return undefined;
            return pushToGithubFile(linkedGithubFile, resumedToken).then(closeGitHubPanel);
          })
          .catch((error: unknown) => {
            notifications.show({
              color: "red",
              message: `Could not push to the repo file: ${describe(error)}`,
            });
          });
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not push to the repo file: ${describe(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  async function handlePullFromGithubFile(): Promise<void> {
    if (linkedGithubFile === undefined || stored === undefined) return;
    setSyncLoading(true);
    try {
      const controller = new AbortController();
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(controller.signal);
      const remoteHead = await fetchGithubFileSha(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        linkedGithubFile.branch,
        linkedGithubFile.path,
        token,
        controller.signal,
      );
      const pulled = await fetchGithubBlobTypeLibraryRevision(
        linkedGithubFile.owner,
        linkedGithubFile.repo,
        remoteHead,
        token,
        controller.signal,
      );
      const syncedRemote: GithubFileLinkedRemote = {
        ...linkedGithubFile,
        lastSyncedRevision: remoteHead,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save(
        { ...stored, document: pulled, linkedRemote: syncedRemote },
        controller.signal,
      );
      notifications.show({ color: "green", message: "Pulled latest from the repo file" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not pull from the repo file: ${describe(error)}`,
      });
    } finally {
      setSyncLoading(false);
    }
  }

  /** Re-read the library's stored `linkedRemote` fresh and run `action`
   *  against it, whichever provider it turns out to be — mirrors
   *  `SyncConflictModal`'s `withLinkedRemote`. */
  async function withLinkedRemote(
    action: (remote: LinkedRemoteSource) => Promise<void>,
  ): Promise<void> {
    if (typeLibrarySyncConflict === undefined) return;
    setResolving(true);
    try {
      const controller = new AbortController();
      const freshStored = await store.get(controller.signal);
      if (freshStored === undefined || freshStored.linkedRemote === undefined) {
        // The library was unlinked while the conflict was pending — nothing
        // left to reconcile against.
        setSyncConflict(undefined);
        return;
      }
      await action(freshStored.linkedRemote);
      setSyncConflict(undefined);
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not resolve the sync conflict: ${describe(error)}`,
      });
    } finally {
      setResolving(false);
    }
  }

  function handleKeepMine(): void {
    void withLinkedRemote(async (remote) => {
      if (typeLibrarySyncConflict === undefined) return;
      const controller = new AbortController();
      const secretStore = createSecretStore(db);
      const token = await secretStore.getGitHubToken(controller.signal);
      if (token === undefined) {
        notifications.show({
          color: "red",
          message: "No GitHub token stored — open the GitHub panel to add one, then retry.",
        });
        return;
      }

      let newSha: string;
      let successMessage: string;
      if (remote.provider === "githubFile") {
        const currentSha = await fetchGithubFileSha(
          remote.owner,
          remote.repo,
          remote.branch,
          remote.path,
          token,
          controller.signal,
        );
        newSha = await pushGithubFileContent(
          remote.owner,
          remote.repo,
          remote.branch,
          remote.path,
          serialiseTypeLibrary(typeLibrarySyncConflict.localDocument),
          currentSha,
          token,
          controller.signal,
        );
        successMessage = "Kept your changes, pushed to the repo file";
      } else {
        newSha = await pushGistFile(
          remote.gistId,
          remote.filename,
          serialiseTypeLibrary(typeLibrarySyncConflict.localDocument),
          token,
          controller.signal,
        );
        successMessage = "Kept your changes, pushed to the gist";
      }

      const freshStored = await store.get(controller.signal);
      if (freshStored === undefined) return;
      const syncedRemote: LinkedRemoteSource = {
        ...remote,
        lastSyncedRevision: newSha,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save({ ...freshStored, linkedRemote: syncedRemote }, controller.signal);
      notifications.show({ color: "green", message: successMessage });
    });
  }

  function handleTakeTheirs(): void {
    void withLinkedRemote(async (remote) => {
      if (typeLibrarySyncConflict === undefined) return;
      const controller = new AbortController();

      let pulled: TypeLibraryDocument;
      let successMessage: string;
      if (remote.provider === "githubFile") {
        const secretStore = createSecretStore(db);
        const token = await secretStore.getGitHubToken(controller.signal);
        pulled = await fetchGithubBlobTypeLibraryRevision(
          remote.owner,
          remote.repo,
          typeLibrarySyncConflict.remoteSha,
          token,
          controller.signal,
        );
        successMessage = "Took the repo file's changes";
      } else {
        pulled = await fetchGistTypeLibraryRevision(
          remote.gistId,
          typeLibrarySyncConflict.remoteSha,
          remote.filename,
          controller.signal,
        );
        successMessage = "Took the gist's changes";
      }

      const freshStored = await store.get(controller.signal);
      if (freshStored === undefined) return;
      const syncedRemote: LinkedRemoteSource = {
        ...remote,
        lastSyncedRevision: typeLibrarySyncConflict.remoteSha,
        lastSyncedAt: new Date().toISOString(),
      };
      await store.save(
        { ...freshStored, document: pulled, linkedRemote: syncedRemote },
        controller.signal,
      );
      notifications.show({ color: "green", message: successMessage });
    });
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="Types" position="right" size="md">
      <Tabs defaultValue="nodeTypes" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="nodeTypes">Node types</Tabs.Tab>
          <Tabs.Tab value="edgeTypes">Edge types</Tabs.Tab>
          <Tabs.Tab value="library">Library</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="nodeTypes" pt="md">
          <Stack gap="xs">
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => setNodePickerOpened(true)}
            >
              Add from library
            </Button>
            <ScrollArea.Autosize mah="60vh" type="scroll">
              <Stack gap="xs">
                {document.types.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No node types yet.
                  </Text>
                ) : (
                  document.types.map((typeDef) => (
                    <Group key={typeDef.name} justify="space-between" gap="xs" px="sm" py="xs">
                      <Group gap="xs" wrap="nowrap">
                        <ColorSwatch color={typeDef.color} size={16} />
                        <Stack gap={0}>
                          <Text size="sm" fw={600}>
                            {typeDef.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {typeDef.name}
                          </Text>
                        </Stack>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Edit"
                          onClick={() => openNodeTypeEditor(typeDef)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Save to library"
                          onClick={() => void handleSaveNodeTypeToLibrary(typeDef)}
                        >
                          <IconBookmark size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Delete"
                          onClick={() => handleDeleteNodeType(typeDef.name)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  ))
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="edgeTypes" pt="md">
          <Stack gap="xs">
            <Button
              variant="default"
              leftSection={<IconPlus size={16} />}
              onClick={() => setEdgePickerOpened(true)}
            >
              Add from library
            </Button>
            <ScrollArea.Autosize mah="60vh" type="scroll">
              <Stack gap="xs">
                {document.edgeTypes.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No edge types yet.
                  </Text>
                ) : (
                  document.edgeTypes.map((typeDef) => (
                    <Group key={typeDef.name} justify="space-between" gap="xs" px="sm" py="xs">
                      <Group gap="xs" wrap="nowrap">
                        <ColorSwatch color={typeDef.color} size={16} />
                        <Stack gap={0}>
                          <Text size="sm" fw={600}>
                            {typeDef.label}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {typeDef.name}
                          </Text>
                        </Stack>
                      </Group>
                      <Group gap={4}>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Edit"
                          onClick={() => openEdgeTypeEditor(typeDef)}
                        >
                          <IconPencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          aria-label="Save to library"
                          onClick={() => void handleSaveEdgeTypeToLibrary(typeDef)}
                        >
                          <IconBookmark size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          aria-label="Delete"
                          onClick={() => handleDeleteEdgeType(typeDef.name)}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  ))
                )}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="library" pt="md">
          <Stack gap="md">
            {typeLibrarySyncConflict !== undefined && (
              <Stack gap="xs">
                <Divider label="Sync conflict" labelPosition="center" />
                <Text size="sm" c="dimmed">
                  This library and its linked remote have both changed since the last sync.
                  Choose which version to keep.
                </Text>
                <Group justify="flex-end" gap="xs">
                  <Button
                    variant="default"
                    leftSection={<IconCloudDownload size={16} />}
                    loading={resolving}
                    onClick={handleTakeTheirs}
                  >
                    Take theirs
                  </Button>
                  <Button
                    leftSection={<IconCloudUpload size={16} />}
                    loading={resolving}
                    onClick={handleKeepMine}
                  >
                    Keep mine
                  </Button>
                </Group>
              </Stack>
            )}

            {linkedRemote === undefined ? (
              <Stack gap="sm">
                <Text size="sm" c="dimmed">
                  This library is not linked to a remote.
                </Text>
                <Select
                  label="Provider"
                  data={[
                    { value: "gist", label: "Gist" },
                    { value: "githubFile", label: "Repo file" },
                  ]}
                  value={provider}
                  onChange={(value) => {
                    if (isProviderKind(value)) setProvider(value);
                  }}
                />
                {provider === "gist" ? (
                  <>
                    <TextInput
                      label="Gist ID"
                      value={gistId}
                      onChange={(event) => setGistId(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Filename"
                      value={filename}
                      onChange={(event) => setFilename(event.currentTarget.value)}
                    />
                  </>
                ) : (
                  <>
                    <TextInput
                      label="Owner"
                      value={owner}
                      onChange={(event) => setOwner(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Repo"
                      value={repo}
                      onChange={(event) => setRepo(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Branch"
                      value={branch}
                      onChange={(event) => setBranch(event.currentTarget.value)}
                    />
                    <TextInput
                      label="Path"
                      value={path}
                      onChange={(event) => setPath(event.currentTarget.value)}
                    />
                  </>
                )}
                <Button
                  leftSection={<IconLink size={16} />}
                  loading={linking}
                  onClick={() => void handleLink()}
                >
                  Link
                </Button>
              </Stack>
            ) : (
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  {linkedRemote.provider === "gist" ? (
                    <>
                      Linked to gist{" "}
                      <Text span fw={600}>
                        {linkedRemote.filename}
                      </Text>
                    </>
                  ) : (
                    <>
                      Linked to{" "}
                      <Text span fw={600}>
                        {linkedRemote.owner}/{linkedRemote.repo}/{linkedRemote.path}
                      </Text>
                    </>
                  )}
                </Text>
                <Group gap="xs">
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconCloudUpload size={14} />}
                    loading={syncLoading}
                    onClick={() =>
                      void (linkedRemote.provider === "gist"
                        ? handlePushToGist()
                        : handlePushToGithubFile())
                    }
                  >
                    Push
                  </Button>
                  <Button
                    variant="default"
                    size="xs"
                    leftSection={<IconCloudDownload size={14} />}
                    loading={syncLoading}
                    onClick={() =>
                      void (linkedRemote.provider === "gist"
                        ? handlePullFromGist()
                        : handlePullFromGithubFile())
                    }
                  >
                    Pull
                  </Button>
                </Group>
                <Select
                  label="Sync mode"
                  data={[
                    { value: "off", label: "Off" },
                    { value: "manual", label: "Manual" },
                    { value: "automatic", label: "Automatic" },
                  ]}
                  value={linkedRemote.syncMode}
                  onChange={(value) => {
                    if (isSyncMode(value)) void handleSyncModeChange(value);
                  }}
                />
              </Stack>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      <TypeEditorModal
        opened={nodeEditorOpened}
        onClose={() => setNodeEditorOpened(false)}
        {...(editingNodeType !== undefined ? { editing: editingNodeType } : {})}
      />
      <EdgeTypeEditorModal
        opened={edgeEditorOpened}
        onClose={() => setEdgeEditorOpened(false)}
        {...(editingEdgeType !== undefined ? { editing: editingEdgeType } : {})}
      />
      <LibraryTypePickerModal
        opened={nodePickerOpened}
        onClose={() => setNodePickerOpened(false)}
        kind="node"
      />
      <LibraryTypePickerModal
        opened={edgePickerOpened}
        onClose={() => setEdgePickerOpened(false)}
        kind="edge"
      />
    </Drawer>
  );
}
