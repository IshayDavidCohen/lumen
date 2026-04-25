import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UploadStatus } from "@/constants/apiTypes";

export interface IngestHistoryEntry {
  id: string;
  filename: string;
  fileSize: number;
  ingestType: string;
  jobId: string | null;
  status: UploadStatus | "FAILED";
  error: string | null;
  completedAt: number;
}

const MAX_ENTRIES = 200;

interface IngestHistoryState {
  entries: IngestHistoryEntry[];
  addEntry: (entry: IngestHistoryEntry) => void;
  removeEntry: (id: string) => void;
  clearAll: () => void;
}

export const useIngestHistoryStore = create<IngestHistoryState>()(
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
    { name: "lumen-ingest-history" },
  ),
);
