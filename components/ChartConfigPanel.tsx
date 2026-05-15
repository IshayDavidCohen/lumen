import { useState, useCallback, useMemo, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Column, ChartConfig, ChartType } from "@/constants/apiTypes";
import { CHART_TYPE_OPTIONS } from "@/constants/chartTypes";

interface ChartConfigPanelProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  config: ChartConfig;
  onChange: (config: ChartConfig) => void;
}

export function ChartConfigPanel({
  columns,
  rows,
  config,
  onChange,
}: ChartConfigPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const numericCols = useMemo(
    () => columns.filter((c) => c.type === "number"),
    [columns],
  );

  const stringCols = useMemo(
    () => columns.filter((c) => c.type === "string"),
    [columns],
  );

  const groupByCandidates = useMemo(() => {
    return stringCols.filter((col) => {
      const unique = new Set(rows.slice(0, 200).map((r) => r[col.name]));
      return unique.size < 20;
    });
  }, [stringCols, rows]);

  const allCols = columns;

  const update = useCallback(
    (patch: Partial<ChartConfig>) => {
      onChange({ ...config, ...patch });
    },
    [config, onChange],
  );

  // Auto-set sensible defaults when columns change
  useEffect(() => {
    if (!columns.find((c) => c.name === config.xColumn)) {
      const defaultX =
        columns.find((c) => c.type === "string" || c.type === "date") ??
        columns[0];
      if (defaultX) update({ xColumn: defaultX.name });
    }
    if (
      config.type !== "histogram" &&
      !columns.find((c) => c.name === config.yColumn)
    ) {
      const defaultY = numericCols[0];
      if (defaultY) update({ yColumn: defaultY.name });
    }
  }, [columns]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="rounded-lg border
                 border-zinc-200 bg-white
                 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium
                   text-zinc-600 hover:bg-zinc-50
                   dark:text-zinc-400 dark:hover:bg-zinc-800/50"
      >
        Chart Configuration
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>

      {!collapsed && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex flex-wrap gap-4">
            {/* Chart type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Type
              </label>
              <div className="flex gap-1">
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => update({ type: opt.value as ChartType })}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
                      ${
                        config.type === opt.value
                          ? "bg-blue-600 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      }`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* X Column */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                X Axis
              </label>
              <select
                value={config.xColumn}
                onChange={(e) => update({ xColumn: e.target.value })}
                className="h-7 rounded-md border px-2 text-xs
                           border-zinc-300 bg-white text-zinc-700
                           dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {allCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Y Column (hidden for histogram) */}
            {config.type !== "histogram" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Y Axis
                </label>
                <select
                  value={config.yColumn}
                  onChange={(e) => update({ yColumn: e.target.value })}
                  className="h-7 rounded-md border px-2 text-xs
                             border-zinc-300 bg-white text-zinc-700
                             dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  {numericCols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Group by */}
            {config.type !== "histogram" && groupByCandidates.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Group By
                </label>
                <select
                  value={config.groupByColumn ?? ""}
                  onChange={(e) =>
                    update({
                      groupByColumn: e.target.value || undefined,
                    })
                  }
                  className="h-7 rounded-md border px-2 text-xs
                             border-zinc-300 bg-white text-zinc-700
                             dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                >
                  <option value="">None</option>
                  {groupByCandidates.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Bin count for histogram */}
            {config.type === "histogram" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Bins
                </label>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={config.binCount ?? 20}
                  onChange={(e) =>
                    update({ binCount: Math.max(5, Number(e.target.value)) })
                  }
                  className="h-7 w-16 rounded-md border px-2 text-xs
                             border-zinc-300 bg-white text-zinc-700
                             dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
