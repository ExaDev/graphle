/**
 * Ephemeral UI store for the type library editor's sync state. Deliberately
 * standalone rather than folded into `useGraphStore`: the type library is a
 * singleton, independent of any one graph, so it carries no `graphId` the
 * way {@link SyncConflict} in `graph-store.ts` does.
 */
import { create } from "zustand";

import type { TypeLibraryDocument } from "@/schema";

/**
 * A detected divergence between the local type library and its linked
 * remote's HEAD, set by `useTypeLibraryAutoSync` when a push or a conflict
 * check finds the remote has moved since the library's last recorded sync.
 * Mirrors `graph-store.ts`'s `SyncConflict` shape, minus `graphId` — the
 * library has no graph identity, it is a singleton.
 */
export interface TypeLibrarySyncConflict {
  localDocument: TypeLibraryDocument;
  remoteSha: string;
}

interface TypeLibraryState {
  /** A detected local/remote type library divergence awaiting resolution, or
   *  `undefined` when none is pending. Ephemeral — never persisted. */
  syncConflict: TypeLibrarySyncConflict | undefined;
  /** Set or clear the pending sync conflict. */
  setSyncConflict: (conflict: TypeLibrarySyncConflict | undefined) => void;
}

export const useTypeLibraryStore = create<TypeLibraryState>()((set) => ({
  syncConflict: undefined,
  setSyncConflict: (syncConflict) => set({ syncConflict }),
}));
