/**
 * Keeps the `#g=` share fragment in sync with the document, in both directions.
 *
 * On mount: if the URL carries a `#g=` payload, decode and load it. A malformed
 * payload throws {@link ShareDecodeError}; we surface it as a red notification
 * and leave the current document untouched.
 *
 * While mounted: subscribe to document changes and, debounced, write the
 * document back to the URL via `history.replaceState` (no extra history step).
 *
 * The guard against clobbering the just-loaded link is the store's `dirty`
 * flag: loading via `replaceDocument` leaves `dirty = false`, so the load's own
 * document change is skipped by the subscriber. Only edits (`apply`, which sets
 * `dirty = true`) ever reach the URL. This also means an unedited shared graph
 * is never needlessly re-serialised.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import { ShareDecodeError } from "@/sharing/codec";
import {
  readDocumentFromLocation,
  writeDocumentToLocation,
} from "@/sharing/url";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a document change is written to the URL fragment. */
const WRITE_DEBOUNCE_MS = 300;

export function useUrlSync(): void {
  const replaceDocument = useGraphStore((s) => s.replaceDocument);

  useEffect(() => {
    // Subscribe before loading so the load's own document change is observed
    // (and skipped, since loading leaves dirty = false).
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useGraphStore.subscribe(
      (state) => state.document,
      () => {
        // Only persist edited documents; the initial document and freshly
        // loaded shares are clean and must not overwrite the URL.
        if (!useGraphStore.getState().dirty) return;
        if (writeTimer !== undefined) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
          writeDocumentToLocation(useGraphStore.getState().document);
        }, WRITE_DEBOUNCE_MS);
      },
    );

    // Load: decode a `#g=` share if present. A bad payload is reported and the
    // current document is left in place; anything unexpected is rethrown.
    try {
      const loaded = readDocumentFromLocation();
      if (loaded !== undefined) {
        replaceDocument(loaded.document);
      }
    } catch (error) {
      if (error instanceof ShareDecodeError) {
        notifications.show({
          color: "red",
          message: `Could not open the shared graph: ${error.message}`,
        });
      } else {
        throw error;
      }
    }

    return () => {
      unsubscribe();
      if (writeTimer !== undefined) clearTimeout(writeTimer);
    };
  }, [replaceDocument]);
}
