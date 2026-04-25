import { Trash2, X } from "lucide-react";
import {
  useIngestHistoryStore,
  type IngestHistoryEntry,
} from "@/hooks/useIngestHistory";
import { StatusBadge } from "@/components/StatusBadge";
import { formatFileSize } from "@/constants/fileTypes";

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function HistoryRow({
  entry,
  onRemove,
}: {
  entry: IngestHistoryEntry;
  onRemove: (id: string) => void;
}) {
  const isFailed = entry.status === "FAILED";

  let rowStyles =
    "dark:border-zinc-800 dark:bg-zinc-900/30 light:border-zinc-200 light:bg-white";
  if (isFailed) {
    rowStyles =
      "dark:border-red-500/10 dark:bg-red-500/[0.03] light:border-red-100 light:bg-red-50/50";
  }

  return (
    <div
      className={`group flex items-center gap-4 rounded-lg border px-4 py-2.5 transition-colors duration-150 ${rowStyles}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-mono text-sm dark:text-zinc-300 light:text-zinc-700"
            title={entry.filename}
          >
            {entry.filename}
          </span>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium dark:bg-zinc-800 dark:text-zinc-400 light:bg-zinc-100 light:text-zinc-500">
            {entry.ingestType}
          </span>
          <span className="shrink-0 text-xs dark:text-zinc-600 light:text-zinc-400">
            {formatFileSize(entry.fileSize)}
          </span>
        </div>
        {entry.error && (
          <p className="mt-0.5 text-xs text-red-400">{entry.error}</p>
        )}
      </div>

      <StatusBadge status={entry.status} />

      <span
        className="shrink-0 text-xs tabular-nums dark:text-zinc-600 light:text-zinc-400"
        title={new Date(entry.completedAt).toLocaleString()}
      >
        {formatRelativeTime(entry.completedAt)}
      </span>

      <button
        onClick={() => onRemove(entry.id)}
        className="shrink-0 rounded-full p-1 opacity-0 transition-all duration-150 group-hover:opacity-100
                   dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
                   light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700"
        title="Remove from history"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function IngestHistory() {
  const { entries, removeEntry, clearAll } = useIngestHistoryStore();

  if (entries.length === 0) {
    return (
      <p className="py-6 text-center text-sm dark:text-zinc-600 light:text-zinc-400">
        No upload history yet
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium dark:text-zinc-400 light:text-zinc-600">
          History
        </h2>
        <button
          onClick={clearAll}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors duration-150
                     dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
                     light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700"
        >
          <Trash2 size={12} />
          Clear history
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} onRemove={removeEntry} />
        ))}
      </div>
    </div>
  );
}
