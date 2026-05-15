import { useCallback, useMemo } from "react";
import type { Column, TopologyConfig } from "@/constants/apiTypes";

interface TopologyConfigPanelProps {
  columns: Column[];
  config: TopologyConfig;
  onChange: (config: TopologyConfig) => void;
}

export function TopologyConfigPanel({
  columns,
  config,
  onChange,
}: TopologyConfigPanelProps) {
  const stringCols = useMemo(
    () => columns.filter((c) => c.type === "string"),
    [columns],
  );
  const numericCols = useMemo(
    () => columns.filter((c) => c.type === "number"),
    [columns],
  );

  const update = useCallback(
    (patch: Partial<TopologyConfig>) => {
      onChange({ ...config, ...patch });
    },
    [config, onChange],
  );

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border px-4 py-3
                    border-zinc-200 bg-white
                    dark:border-zinc-800 dark:bg-zinc-900/50">
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Source Column
        </label>
        <select
          value={config.sourceColumn}
          onChange={(e) => update({ sourceColumn: e.target.value })}
          className="h-7 rounded-md border px-2 text-xs
                     border-zinc-300 bg-white text-zinc-700
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">Select…</option>
          {stringCols.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Target Column
        </label>
        <select
          value={config.targetColumn}
          onChange={(e) => update({ targetColumn: e.target.value })}
          className="h-7 rounded-md border px-2 text-xs
                     border-zinc-300 bg-white text-zinc-700
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">Select…</option>
          {stringCols.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Edge Weight / Node Size
        </label>
        <select
          value={config.metricColumn ?? ""}
          onChange={(e) => update({ metricColumn: e.target.value || undefined })}
          className="h-7 rounded-md border px-2 text-xs
                     border-zinc-300 bg-white text-zinc-700
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        >
          <option value="">None (count rows)</option>
          {numericCols.map((c) => (
            <option key={c.name} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Max Nodes
        </label>
        <input
          type="number"
          min={10}
          max={200}
          value={config.limit ?? 50}
          onChange={(e) => update({ limit: Math.max(10, Math.min(200, Number(e.target.value))) })}
          className="h-7 w-20 rounded-md border px-2 text-xs
                     border-zinc-300 bg-white text-zinc-700
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        />
      </div>
    </div>
  );
}
