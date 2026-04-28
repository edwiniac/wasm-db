import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { filesReducer, initialFilesState } from './filesState';
import type { RegisteredFile, FilesAction } from './filesState';

export interface FilesStore {
  files: RegisteredFile[];
  filesDispatch: (action: FilesAction) => void;
}

export const useFilesStore = create<FilesStore>()(
  persist(
    (set) => ({
      files: initialFilesState,
      filesDispatch: (action: FilesAction) =>
        set((state) => ({ files: filesReducer(state.files, action) })),
    }),
    {
      name: 'wasm-db-files',
      partialize: (state) => ({
        files: state.files.map((f) => ({
          id: f.id,
          alias: f.alias,
          url: f.url,
          // Clamp status on reload: ready stays ready; probing/error resets to idle
          status: f.status === 'ready' ? ('ready' as const) : ('idle' as const),
        })),
      }),
    },
  ),
);
