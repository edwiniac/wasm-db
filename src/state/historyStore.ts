import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ENTRIES = 50;

export interface HistoryEntry {
  id: string;
  sql: string;
  timestamp: number;
  rowCount: number;
}

interface HistoryState {
  entries: HistoryEntry[];
  addEntry: (sql: string, rowCount: number) => void;
  clearHistory: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (sql: string, rowCount: number) => {
        const trimmed = sql.trim();
        const current = get().entries;
        if (current.length > 0 && current[0].sql.trim() === trimmed) return;
        const entry: HistoryEntry = {
          id: crypto.randomUUID(),
          sql: trimmed,
          timestamp: Date.now(),
          rowCount,
        };
        const next = [entry, ...current];
        set({ entries: next.slice(0, MAX_ENTRIES) });
      },
      clearHistory: () => set({ entries: [] }),
    }),
    { name: 'wasm-db-history' },
  ),
);
