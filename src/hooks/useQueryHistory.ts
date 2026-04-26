import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  rowCount: number;
  executedAt: number;
  durationMs: number;
}

const MAX_ENTRIES = 100;

interface QueryHistoryState {
  entries: QueryHistoryEntry[];
  addEntry: (entry: QueryHistoryEntry) => void;
  removeEntry: (id: string) => void;
  clearAll: () => void;
}

let historyCounter = 0;

export function createHistoryEntry(
  sql: string,
  rowCount: number,
  durationMs: number,
): QueryHistoryEntry {
  return {
    id: `qh-${++historyCounter}-${Date.now()}`,
    sql,
    rowCount,
    executedAt: Date.now(),
    durationMs,
  };
}

export const useQueryHistoryStore = create<QueryHistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => {
          const updated = [entry, ...state.entries];
          if (updated.length > MAX_ENTRIES) {
            updated.length = MAX_ENTRIES;
          }
          return { entries: updated };
        }),
      removeEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((e) => e.id !== id),
        })),
      clearAll: () => set({ entries: [] }),
    }),
    { name: "lumen-query-history" },
  ),
);
