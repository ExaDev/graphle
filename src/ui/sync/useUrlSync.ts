/**
 * Keeps the share fragment in sync with the document, in both directions.
 *
 * On mount: an inline `#g=` payload takes precedence and is decoded
 * synchronously; a malformed payload throws {@link ShareDecodeError}, which we
 * surface as a red notification and leave the current document untouched.
 * Otherwise, a `#url=` fragment is resolved asynchronously via {@link
 * resolveRemoteUrl} — which also disambiguates a gist URL that names the gist
 * as a whole rather than one file — and loaded on success. `resolveRemoteUrl`
 * normalises the resolved single-file URL back into the address bar (via
 * {@link writeRemoteUrlToLocation}) so a reload or a re-share goes straight to
 * that file, skipping the gist-listing round trip next time. More than one
 * valid graph file in a gist opens the picker (`store.gistPicker`,
 * `GistPickerModal`) instead of loading anything. Any {@link RemoteLoadError}
 * (a network failure, a non-2xx response, non-JSON, JSON that decodes to
 * neither a graphle document nor a canvas, or a gist with no graph files) is
 * surfaced as a red notification rather than left to reject silently. The
 * in-flight fetch is aborted on unmount.
 *
 * While mounted: subscribe to document changes and, debounced, write the
 * document back to the URL via `history.replaceState` (no extra history step).
 *
 * The guard against clobbering the just-loaded link is the store's `dirty`
 * flag: loading via `replaceDocument` leaves `dirty = false`, so the load's own
 * document change is skipped by the subscriber. Only edits (`apply`, which sets
 * `dirty = true`) ever reach the URL — including a document that arrived via
 * `#url=`, so a remote pointer is only ever overwritten by a `#g=` snapshot
 * once the user actually changes something; an unedited load, inline or
 * remote, is never needlessly re-serialised or rewritten.
 */
import { useEffect } from "react";
import { notifications } from "@mantine/notifications";

import { ShareDecodeError } from "@/sharing/codec";
import { resolveRemoteUrl } from "@/sharing/gist";
import { RemoteLoadError } from "@/sharing/remote";
import {
  readDocumentFromLocation,
  readRemoteUrlFromLocation,
  writeDocumentToLocation,
  writeRemoteUrlToLocation,
} from "@/sharing/url";
import { useGraphStore } from "@/ui/store/graph-store";

/** Debounce window before a document change is written to the URL fragment. */
const WRITE_DEBOUNCE_MS = 300;

/** Render any thrown value as a message string. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useUrlSync(): void {
  const replaceDocument = useGraphStore((s) => s.replaceDocument);
  const setGistPicker = useGraphStore((s) => s.setGistPicker);

  useEffect(() => {
    // Subscribe before loading so the load's own document change is observed
    // (and skipped, since loading leaves dirty = false).
    let writeTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useGraphStore.subscribe(
      (state) => state.document,
      () => {
        // Only persist edited documents; the initial document and freshly
        // loaded shares (inline or remote) are clean and must not overwrite
        // the URL.
        if (!useGraphStore.getState().dirty) return;
        if (writeTimer !== undefined) clearTimeout(writeTimer);
        writeTimer = setTimeout(() => {
          writeDocumentToLocation(useGraphStore.getState().document);
        }, WRITE_DEBOUNCE_MS);
      },
    );

    const controller = new AbortController();

    // Load: an inline `#g=` share takes precedence and decodes synchronously.
    // A bad payload is reported and the current document is left in place;
    // anything unexpected is rethrown.
    try {
      const loaded = readDocumentFromLocation();
      if (loaded !== undefined) {
        replaceDocument(loaded.document);
      } else {
        // No inline share: fall back to a `#url=` remote fetch, if present.
        const remoteUrl = readRemoteUrlFromLocation();
        if (remoteUrl !== undefined) {
          resolveRemoteUrl(remoteUrl, controller.signal)
            .then((result) => {
              if (controller.signal.aborted) return;
              if (result.kind === "ambiguousGist") {
                setGistPicker({ candidates: result.candidates });
                return;
              }
              replaceDocument(result.document);
              // Normalise the address bar to the resolved single-file URL so
              // a reload skips re-resolving an ambiguous gist URL.
              if (result.resolvedUrl !== remoteUrl) {
                writeRemoteUrlToLocation(result.resolvedUrl);
              }
            })
            .catch((error: unknown) => {
              if (controller.signal.aborted) return;
              notifications.show({
                color: "red",
                message:
                  error instanceof RemoteLoadError
                    ? `Could not load the remote graph: ${error.message}`
                    : `Could not load the remote graph: ${describe(error)}`,
              });
            });
        }
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
      controller.abort();
      if (writeTimer !== undefined) clearTimeout(writeTimer);
    };
  }, [replaceDocument, setGistPicker]);
}
