import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { Column, ChartConfig } from "@/constants/apiTypes";

interface ChartProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  config: ChartConfig;
  height?: number;
  className?: string;
}

const SERIES_COLORS = [
  "#3b82f6",
  "#14b8a6",
  "#f59e0b",
  "#f43f5e",
  "#8b5cf6",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
];

function computeHistogramBins(
  values: number[],
  binCount: number,
): Array<{ bin: string; count: number }> {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ bin: String(min), count: values.length }];
  const binWidth = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    bin: `${(min + i * binWidth).toFixed(1)}`,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    bins[idx]!.count++;
  }
  return bins;
}

export function Chart({
  columns,
  rows,
  config,
  height = 400,
  className,
}: ChartProps) {
  const yCol = columns.find((c) => c.name === config.yColumn);
  const isYNumeric =
    config.type === "histogram" || (yCol && yCol.type === "number");

  const histogramData = useMemo(() => {
    if (config.type !== "histogram") return null;
    const values = rows
      .map((r) => r[config.xColumn])
      .filter((v): v is number => typeof v === "number");
    return computeHistogramBins(values, config.binCount ?? 20);
  }, [rows, config.xColumn, config.binCount, config.type]);

  const groupedData = useMemo(() => {
    if (config.type === "histogram" || !config.groupByColumn) return null;
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const key = String(row[config.groupByColumn] ?? "unknown");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }
    return groups;
  }, [rows, config.groupByColumn, config.type]);

  if (rows.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 ${className ?? ""}`}
        style={{ height }}
      >
        <p className="text-sm text-zinc-400 dark:text-zinc-600">
          No data to visualize
        </p>
      </div>
    );
  }

  if (
    config.type !== "histogram" &&
    !isYNumeric
  ) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 ${className ?? ""}`}
        style={{ height }}
      >
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Y-axis column must be numeric for {config.type} charts
        </p>
      </div>
    );
  }

  if (config.type === "histogram" && histogramData) {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={histogramData}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey="bin" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-zinc-900, #18181b)",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
                color: "#e4e4e7",
              }}
            />
            <Bar dataKey="count" fill={SERIES_COLORS[0]} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === "scatter") {
    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={config.xColumn} name={config.xColumn} tick={{ fontSize: 11 }} />
            <YAxis dataKey={config.yColumn} name={config.yColumn} tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-zinc-900, #18181b)",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
                color: "#e4e4e7",
              }}
            />
            <Legend />
            <Scatter
              data={rows}
              fill={SERIES_COLORS[0]}
              opacity={0.7}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (config.type === "line") {
    if (groupedData && groupedData.size > 0) {
      const allKeys = new Set<string>();
      const merged = new Map<string, Record<string, unknown>>();
      for (const [group, groupRows] of groupedData) {
        allKeys.add(group);
        for (const row of groupRows) {
          const xKey = String(row[config.xColumn]);
          if (!merged.has(xKey)) {
            merged.set(xKey, { [config.xColumn]: row[config.xColumn] });
          }
          merged.get(xKey)![group] = row[config.yColumn];
        }
      }
      const data = Array.from(merged.values());
      const groups = Array.from(allKeys);

      return (
        <div className={className}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey={config.xColumn} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-zinc-900, #18181b)",
                  border: "1px solid #3f3f46",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "#e4e4e7",
                }}
              />
              <Legend />
              {groups.map((g, i) => (
                <Line
                  key={g}
                  type="monotone"
                  dataKey={g}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={config.xColumn} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-zinc-900, #18181b)",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
                color: "#e4e4e7",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey={config.yColumn}
              stroke={SERIES_COLORS[0]}
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Bar chart (default)
  if (groupedData && groupedData.size > 0) {
    const allKeys = new Set<string>();
    const merged = new Map<string, Record<string, unknown>>();
    for (const [group, groupRows] of groupedData) {
      allKeys.add(group);
      for (const row of groupRows) {
        const xKey = String(row[config.xColumn]);
        if (!merged.has(xKey)) {
          merged.set(xKey, { [config.xColumn]: row[config.xColumn] });
        }
        merged.get(xKey)![group] = row[config.yColumn];
      }
    }
    const data = Array.from(merged.values());
    const groups = Array.from(allKeys);

    return (
      <div className={className}>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis dataKey={config.xColumn} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-zinc-900, #18181b)",
                border: "1px solid #3f3f46",
                borderRadius: 8,
                fontSize: 12,
                color: "#e4e4e7",
              }}
            />
            <Legend />
            {groups.map((g, i) => (
              <Bar
                key={g}
                dataKey={g}
                fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis dataKey={config.xColumn} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-zinc-900, #18181b)",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
              color: "#e4e4e7",
            }}
          />
          <Legend />
          <Bar
            dataKey={config.yColumn}
            fill={SERIES_COLORS[0]}
            radius={[2, 2, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
