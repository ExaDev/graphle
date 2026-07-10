/**
 * Prompts the user to pick one file when an ambiguous gist URL — its page, or
 * the filename-less raw endpoint — resolved to more than one valid graph
 * file (see `@/sharing/gist`). Driven entirely by `store.gistPicker`: opens
 * whenever it is set, regardless of which entry point set it (page-load
 * `#url=`, the Graphs drawer's "Load from URL"), so both share one picker
 * instead of duplicating this UI.
 *
 * Picking a file loads it exactly like a direct single-file `#url=` load:
 * `replaceDocument`, clear `graphId` (it is not a locally stored graph), and
 * point the address bar at that file's specific raw URL via {@link
 * writeRemoteUrlToLocation} so a reload or a shared link goes straight back
 * to the same file — never back through the ambiguous gist URL and another
 * API round trip.
 */
import { Button, Modal, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileText } from "@tabler/icons-react";

import type { GistFileCandidate } from "@/sharing/gist";
import { writeRemoteUrlToLocation } from "@/sharing/url";
import { useGraphStore } from "@/ui/store/graph-store";

export function GistPickerModal() {
  const gistPicker = useGraphStore((state) => state.gistPicker);
  const setGistPicker = useGraphStore((state) => state.setGistPicker);
  const replaceDocument = useGraphStore((state) => state.replaceDocument);
  const setGraphId = useGraphStore((state) => state.setGraphId);

  function handleClose(): void {
    setGistPicker(undefined);
  }

  function handlePick(candidate: GistFileCandidate): void {
    if (candidate.document === undefined) return;
    replaceDocument(candidate.document);
    setGraphId(undefined);
    writeRemoteUrlToLocation(candidate.rawUrl);
    setGistPicker(undefined);
    notifications.show({
      color: "green",
      message: `Loaded ${candidate.filename} from the gist`,
    });
  }

  return (
    <Modal
      opened={gistPicker !== undefined}
      onClose={handleClose}
      title="Pick a graph from this gist"
      centered
    >
      <Stack>
        <Text size="sm" c="dimmed">
          This gist has more than one file that looks like a graph. Pick which
          one to load.
        </Text>
        {gistPicker?.candidates.map((candidate) => (
          <Button
            key={candidate.filename}
            variant="default"
            justify="space-between"
            leftSection={<IconFileText size={16} />}
            onClick={() => handlePick(candidate)}
          >
            <Stack gap={0} align="flex-start">
              <Text size="sm" fw={600}>
                {candidate.filename}
              </Text>
              {candidate.document !== undefined && (
                <Text size="xs" c="dimmed">
                  {candidate.document.name} · {candidate.document.nodes.length} node
                  {candidate.document.nodes.length === 1 ? "" : "s"}
                </Text>
              )}
            </Stack>
          </Button>
        ))}
      </Stack>
    </Modal>
  );
}
