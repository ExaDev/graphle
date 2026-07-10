/**
 * Drawer listing saved graphs (IndexedDB via the storage contract) with
 * Save / Save as / Load / Rename / Delete, plus JSON export and import.
 *
 * The list is live: `useLiveQuery` re-runs whenever the underlying Dexie table
 * changes, so a save or delete in this drawer (or anywhere) refreshes the list
 * without manual invalidation. All storage goes through `createGraphStore(db)`
 * — the UI never touches Dexie directly, keeping the storage boundary clean.
 *
 * Import parses through `importDocument` (the Zod-validated codec), so a
 * malformed file is reported as a notification and leaves the current document
 * untouched rather than silently producing an invalid graph.
 *
 * "Load from URL" resolves a remote document via `resolveRemoteUrl` (the same
 * JSON-shape detection as `#url=` share fragments and file import, plus gist
 * disambiguation — see `@/sharing/gist`) and, on success, points the address
 * bar at the resolved URL via `writeRemoteUrlToLocation` so the resulting
 * share link stays a live pointer rather than a frozen snapshot — mirroring
 * how `useUrlSync` handles a `#url=` fragment on load. An ambiguous gist
 * (more than one file looks like a graph) opens `GistPickerModal` instead of
 * loading anything, via the shared `store.gistPicker` state.
 */
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Drawer,
  FileInput,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { IconDownload, IconPencil, IconTrash, IconUpload, IconWorldDownload } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";

import { resolveRemoteUrl } from "@/sharing/gist";
import { exportCanvasDocument, exportDocument, importDocument } from "@/sharing/json";
import { writeRemoteUrlToLocation } from "@/sharing/url";
import { type StoredGraphSummary } from "@/schema";
import { db } from "@/storage/db";
import { createGraphStore } from "@/storage/graph-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

import { graphRow, selectedGraphRow } from "./GraphsDrawer.css";

export interface GraphsDrawerProps {
  opened: boolean;
  onClose: () => void;
}

/** Stable empty list used as the `useLiveQuery` default before the first read. */
const EMPTY_SUMMARIES: StoredGraphSummary[] = [];

export function GraphsDrawer({ opened, onClose }: GraphsDrawerProps) {
  // The store is created once; `db` is a process-wide singleton.
  const store = useMemo(() => createGraphStore(db), []);

  const document = useGraphStore((state) => state.document);
  const graphId = useGraphStore((state) => state.graphId);
  const dirty = useGraphStore((state) => state.dirty);
  const apply = useGraphStore((state) => state.apply);
  const replaceDocument = useGraphStore((state) => state.replaceDocument);
  const setGraphId = useGraphStore((state) => state.setGraphId);
  const markSaved = useGraphStore((state) => state.markSaved);
  const setGistPicker = useGraphStore((state) => state.setGistPicker);

  const summaries = useLiveQuery(
    async () => store.list(new AbortController().signal),
    [],
    EMPTY_SUMMARIES,
  );

  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);

  async function handleSave(): Promise<void> {
    if (graphId === undefined) {
      void handleSaveAs();
      return;
    }
    const controller = new AbortController();
    const existing = await store.get(graphId, controller.signal);
    if (existing === undefined) {
      // The backing graph was deleted (e.g. another tab). Save the live
      // document as a new graph instead of dropping the user's work silently.
      void handleSaveAs();
      return;
    }
    await store.save(
      { ...existing, document, updatedAt: new Date().toISOString() },
      controller.signal,
    );
    markSaved();
  }

  async function handleSaveAs(): Promise<void> {
    const name = window.prompt("Save graph as", document.name);
    if (name === null) return; // user cancelled
    const finalName = name === "" ? document.name : name;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const controller = new AbortController();
    await store.save(
      { id, name: finalName, document, createdAt: now, updatedAt: now },
      controller.signal,
    );
    setGraphId(id);
    apply({ type: "renameGraph", name: finalName });
    markSaved();
  }

  async function handleLoad(id: string): Promise<void> {
    const controller = new AbortController();
    const graph = await store.get(id, controller.signal);
    if (graph === undefined) return;
    replaceDocument(graph.document);
    setGraphId(graph.id);
    // replaceDocument already clears the dirty flag.
  }

  async function handleRename(id: string): Promise<void> {
    const controller = new AbortController();
    const graph = await store.get(id, controller.signal);
    if (graph === undefined) return;
    const name = window.prompt("Rename graph", graph.name);
    if (name === null || name === "") return;
    const isCurrent = id === graphId;
    // Persist the LIVE document for the current graph so any unsaved edits are
    // written (not the stale stored snapshot); markSaved then matches disk.
    const documentToSave = isCurrent ? document : graph.document;
    await store.save(
      {
        ...graph,
        name,
        document: { ...documentToSave, name },
        updatedAt: new Date().toISOString(),
      },
      controller.signal,
    );
    if (isCurrent) {
      apply({ type: "renameGraph", name });
      markSaved();
    }
  }

  async function handleDelete(id: string): Promise<void> {
    const controller = new AbortController();
    await store.remove(id, controller.signal);
    if (id === graphId) setGraphId(undefined);
  }

  function handleExport(): void {
    exportDocument(document);
  }

  function handleExportCanvas(): void {
    exportCanvasDocument(document);
  }

  async function handleImport(file: File): Promise<void> {
    try {
      const text = await file.text();
      replaceDocument(importDocument(text));
      setGraphId(undefined);
      notifications.show({ color: "green", message: "Graph imported" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  async function handleLoadFromUrl(): Promise<void> {
    const trimmed = remoteUrl.trim();
    if (trimmed === "") return;
    setRemoteLoading(true);
    try {
      const result = await resolveRemoteUrl(trimmed, new AbortController().signal);
      if (result.kind === "ambiguousGist") {
        setGistPicker({ candidates: result.candidates });
        return;
      }
      replaceDocument(result.document);
      setGraphId(undefined);
      // Point the address bar at the resolved URL so the resulting link
      // stays a live pointer, shareable the same way #g= links are — and, for
      // a gist that auto-resolved to its one graph file, points at that
      // specific file rather than the ambiguous gist URL the user pasted.
      writeRemoteUrlToLocation(result.resolvedUrl);
      notifications.show({ color: "green", message: "Graph loaded from URL" });
    } catch (error) {
      notifications.show({
        color: "red",
        message: `Could not load from URL: ${error instanceof Error ? error.message : String(error)}`,
      });
    } finally {
      setRemoteLoading(false);
    }
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="Graphs" position="right" size="md">
      <Stack gap="md">
        <Group gap="xs">
          <Button variant="default" onClick={() => void handleSave()}>
            Save
          </Button>
          <Button variant="default" onClick={() => void handleSaveAs()}>
            Save as
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={handleExportCanvas}
          >
            Canvas
          </Button>
        </Group>
        <FileInput
          label="Import"
          placeholder="graphle-export.json or .canvas"
          accept="application/json,.json,.canvas"
          leftSection={<IconUpload size={16} />}
          onChange={(file) => {
            if (file !== null) void handleImport(file);
          }}
        />
        <Group gap="xs" align="flex-end">
          <TextInput
            label="Load from URL"
            description="A hosted graphle document or JSON Canvas file (must allow cross-origin requests)"
            placeholder="https://example.com/graph.json"
            style={{ flex: 1 }}
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.currentTarget.value)}
          />
          <Button
            variant="default"
            leftSection={<IconWorldDownload size={16} />}
            loading={remoteLoading}
            onClick={() => void handleLoadFromUrl()}
          >
            Load
          </Button>
        </Group>
        {dirty && (
          <Badge color="orange" variant="light" w="fit-content">
            Unsaved changes
          </Badge>
        )}
        <Divider label="Saved graphs" labelPosition="center" />
        <ScrollArea.Autosize mah="60vh" type="scroll">
          <Stack gap="xs">
            {summaries.length === 0 ? (
              <Text size="sm" c="dimmed">
                No saved graphs yet.
              </Text>
            ) : (
              summaries.map((summary) => (
                <Group
                  key={summary.id}
                  className={`${graphRow}${summary.id === graphId ? ` ${selectedGraphRow}` : ""}`}
                  justify="space-between"
                  gap="xs"
                  px="sm"
                  py="xs"
                >
                  <Stack gap={2}>
                    <UnstyledButton
                      fw={600}
                      onClick={() => {
                        void handleLoad(summary.id);
                      }}
                    >
                      {summary.name}
                    </UnstyledButton>
                    <Text size="xs" c="dimmed">
                      {new Date(summary.updatedAt).toLocaleString()}
                    </Text>
                  </Stack>
                  <Group gap={4}>
                    <ActionIcon
                      variant="subtle"
                      aria-label="Rename"
                      onClick={() => {
                        void handleRename(summary.id);
                      }}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Delete"
                      onClick={() => {
                        void handleDelete(summary.id);
                      }}
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
    </Drawer>
  );
}
