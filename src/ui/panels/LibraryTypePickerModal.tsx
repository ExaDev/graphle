/**
 * Modal for copying a type definition FROM the user's personal type library
 * INTO the currently open graph. Serves both node and edge types through the
 * `kind` prop rather than two near-duplicate files, since the two flows
 * differ only in which library array is read and which graph store action
 * applies the pick.
 *
 * The library read is live via `useLiveQuery` over `createTypeLibraryStore(db)`
 * (mirroring `GraphsDrawer`'s reactive Dexie read), so a save made elsewhere
 * (the type editors' "Also save to library" checkbox) shows up here without
 * a manual refresh.
 *
 * A row's Add button is disabled when its name already collides with a type
 * in the *current* document (built-in or document-carried, via
 * `nodeTypeNameTaken`/`edgeTypeNameTaken`) since the graph store's `addType`/
 * `addEdgeType` has no dedupe of its own and a same-name copy would shadow
 * the existing type. Picking a row spreads the library entry into a new
 * object before handing it to the store: this is a snapshot copy, not a live
 * reference, so editing the library entry afterwards must never retroactively
 * change a graph that already copied it in.
 */
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, ColorSwatch, Group, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { edgeTypeNameTaken, nodeTypeNameTaken } from "@/domain/type-name-collision";
import {
  type EdgeTypeDefinition,
  type NodeTypeDefinition,
  type TypeLibraryDocument,
} from "@/schema";
import { db } from "@/storage/db";
import { createTypeLibraryStore } from "@/storage/type-library-store-dexie";
import { useGraphStore } from "@/ui/store/graph-store";

export interface LibraryTypePickerModalProps {
  opened: boolean;
  onClose: () => void;
  /** Which half of the library to browse, and which store action a pick applies. */
  kind: "node" | "edge";
}

/** An empty library document, used when none has been saved yet. */
const EMPTY_LIBRARY: TypeLibraryDocument = {
  version: 1,
  nodeTypes: [],
  edgeTypes: [],
};

interface LibraryTypeRowProps<T extends { name: string; label: string; color: string }> {
  entry: T;
  taken: boolean;
  onAdd: () => void;
}

function LibraryTypeRow<T extends { name: string; label: string; color: string }>({
  entry,
  taken,
  onAdd,
}: LibraryTypeRowProps<T>) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Group gap="xs" wrap="nowrap">
        <ColorSwatch color={entry.color} size={16} />
        <Stack gap={0}>
          <Text size="sm" fw={600}>
            {entry.label}
          </Text>
          <Text size="xs" c="dimmed">
            {entry.name}
          </Text>
        </Stack>
      </Group>
      {taken ? (
        <Text size="xs" c="dimmed">
          Already in this graph
        </Text>
      ) : (
        <Button size="xs" variant="light" onClick={onAdd}>
          Add
        </Button>
      )}
    </Group>
  );
}

export function LibraryTypePickerModal({
  opened,
  onClose,
  kind,
}: LibraryTypePickerModalProps) {
  // The store is created once; `db` is a process-wide singleton.
  const store = useMemo(() => createTypeLibraryStore(db), []);
  const stored = useLiveQuery(
    async () => store.get(new AbortController().signal),
    [store],
    undefined,
  );
  const library = stored === undefined ? EMPTY_LIBRARY : stored.document;

  const document = useGraphStore((state) => state.document);
  const addType = useGraphStore((state) => state.addType);
  const addEdgeType = useGraphStore((state) => state.addEdgeType);

  function handleAddNodeType(entry: NodeTypeDefinition): void {
    addType({ ...entry });
    onClose();
    notifications.show({
      color: "green",
      message: `Added "${entry.label}" to this graph`,
    });
  }

  function handleAddEdgeType(entry: EdgeTypeDefinition): void {
    addEdgeType({ ...entry });
    onClose();
    notifications.show({
      color: "green",
      message: `Added "${entry.label}" to this graph`,
    });
  }

  const title =
    kind === "node"
      ? "Add a node type from your library"
      : "Add an edge type from your library";

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Stack>
        {kind === "node" ? (
          library.nodeTypes.length === 0 ? (
            <Text size="sm" c="dimmed">
              Your library has no node types yet. Save one from the type editor
              first.
            </Text>
          ) : (
            library.nodeTypes.map((entry) => (
              <LibraryTypeRow
                key={entry.name}
                entry={entry}
                taken={nodeTypeNameTaken(entry.name, document.types)}
                onAdd={() => handleAddNodeType(entry)}
              />
            ))
          )
        ) : library.edgeTypes.length === 0 ? (
          <Text size="sm" c="dimmed">
            Your library has no edge types yet. Save one from the type editor
            first.
          </Text>
        ) : (
          library.edgeTypes.map((entry) => (
            <LibraryTypeRow
              key={entry.name}
              entry={entry}
              taken={edgeTypeNameTaken(entry.name, document.edgeTypes)}
              onAdd={() => handleAddEdgeType(entry)}
            />
          ))
        )}
      </Stack>
    </Modal>
  );
}
