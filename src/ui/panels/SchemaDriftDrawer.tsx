/**
 * Drawer listing every node and edge whose stored `data` no longer matches
 * its resolved type's schema, or whose `type` no longer resolves at all (see
 * `findSchemaDrift`). Read-only report: each row's only action is selecting
 * the offending node or edge on the canvas, mirroring how the inspector
 * highlights a selection elsewhere in the app.
 */
import { useMemo } from "react";
import { ActionIcon, Drawer, Group, ScrollArea, Stack, Text } from "@mantine/core";
import { IconFocus2 } from "@tabler/icons-react";

import { findSchemaDrift } from "@/domain";
import { useGraphStore } from "@/ui/store/graph-store";

export interface SchemaDriftDrawerProps {
  opened: boolean;
  onClose: () => void;
}

export function SchemaDriftDrawer({ opened, onClose }: SchemaDriftDrawerProps) {
  const document = useGraphStore((state) => state.document);
  const setSelection = useGraphStore((state) => state.setSelection);
  const setSelectedNodeIds = useGraphStore((state) => state.setSelectedNodeIds);

  const driftEntries = useMemo(() => findSchemaDrift(document), [document]);

  function handleSelect(kind: "node" | "edge", id: string): void {
    if (kind === "node") {
      setSelection({ nodeId: id, edgeId: undefined });
      setSelectedNodeIds([id]);
    } else {
      setSelection({ nodeId: undefined, edgeId: id });
    }
    onClose();
  }

  return (
    <Drawer opened={opened} onClose={onClose} title="Schema drift" position="right" size="md">
      {driftEntries.length === 0 ? (
        <Text size="sm" c="dimmed">
          No schema drift detected.
        </Text>
      ) : (
        <ScrollArea.Autosize mah="70vh" type="scroll">
          <Stack gap="xs">
            {driftEntries.map((entry) => (
              <Group key={`${entry.kind}-${entry.id}`} justify="space-between" gap="xs" px="sm" py="xs">
                <Stack gap={2}>
                  <Group gap={6}>
                    <Text size="sm" fw={600}>
                      {entry.kind === "node" ? "Node" : "Edge"}: {entry.typeName}
                    </Text>
                  </Group>
                  <Text size="xs" c="dimmed">
                    {entry.issues.join("; ")}
                  </Text>
                </Stack>
                <Group gap={4}>
                  <ActionIcon
                    variant="subtle"
                    aria-label="Select"
                    onClick={() => {
                      handleSelect(entry.kind, entry.id);
                    }}
                  >
                    <IconFocus2 size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Drawer>
  );
}
