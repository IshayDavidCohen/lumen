import { useQuery } from "@tanstack/react-query";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Hash, Type, Calendar } from "lucide-react";
import { getColumnProfile } from "@/services/columnProfile";
import { Chart } from "@/components/Chart";
import type {
  ColumnProfile as ColumnProfileType,
  ColumnProfileNumeric,
  ColumnProfileString,
  ColumnProfileDate,
  ChartConfig,
  Column,
} from "@/constants/apiTypes";

interface ColumnProfileProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetType: string;
  tableName: string;
  columnName: string;
  columnType: Column["type"];
}

function StatGrid({ items }: { items: Array<{ label: string; value: string | number }> }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-md border px-3 py-2
                     border-zinc-200 dark:border-zinc-800"
        >
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {item.label}
          </p>
          <p className="mt-0.5 font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function NumericProfile({ profile }: { profile: ColumnProfileNumeric }) {
  const histColumns: Column[] = [
    { name: "binStart", type: "string", nullable_pct: 0 },
    { name: "count", type: "number", nullable_pct: 0 },
  ];
  const histRows = profile.histogram.map((b) => ({
    binStart: `${b.binStart}`,
    count: b.count,
  }));
  const histConfig: ChartConfig = {
    id: "profile-hist",
    name: "Histogram",
    type: "histogram" as const,
    xColumn: "count",
    yColumn: "count",
    createdAt: Date.now(),
  };
  // Use a bar chart directly for the profile histogram
  const barConfig: ChartConfig = {
    ...histConfig,
    type: "bar",
    xColumn: "binStart",
    yColumn: "count",
  };

  return (
    <div className="flex flex-col gap-4">
      <StatGrid
        items={[
          { label: "Count", value: profile.count.toLocaleString() },
          { label: "Nulls", value: `${profile.nullCount} (${profile.nullPct}%)` },
          { label: "Min", value: profile.min.toLocaleString() },
          { label: "Max", value: profile.max.toLocaleString() },
          { label: "Mean", value: profile.mean.toLocaleString() },
          { label: "Median", value: profile.median.toLocaleString() },
          { label: "Std Dev", value: profile.stdDev.toLocaleString() },
          { label: "P25", value: profile.p25.toLocaleString() },
          { label: "P75", value: profile.p75.toLocaleString() },
        ]}
      />
      {histRows.length > 0 && (
        <Chart columns={histColumns} rows={histRows} config={barConfig} height={250} />
      )}
    </div>
  );
}

function StringProfile({ profile }: { profile: ColumnProfileString }) {
  const barColumns: Column[] = [
    { name: "value", type: "string", nullable_pct: 0 },
    { name: "count", type: "number", nullable_pct: 0 },
  ];
  const barConfig: ChartConfig = {
    id: "profile-topvals",
    name: "Top Values",
    type: "bar",
    xColumn: "value",
    yColumn: "count",
    createdAt: Date.now(),
  };

  return (
    <div className="flex flex-col gap-4">
      <StatGrid
        items={[
          { label: "Count", value: profile.count.toLocaleString() },
          { label: "Nulls", value: `${profile.nullCount} (${profile.nullPct}%)` },
          { label: "Unique", value: profile.uniqueCount.toLocaleString() },
          { label: "Min Length", value: profile.minLength },
          { label: "Max Length", value: profile.maxLength },
          { label: "Avg Length", value: profile.avgLength },
        ]}
      />
      {profile.topValues.length > 0 && (
        <Chart columns={barColumns} rows={profile.topValues} config={barConfig} height={250} />
      )}
    </div>
  );
}

function DateProfile({ profile }: { profile: ColumnProfileDate }) {
  const barColumns: Column[] = [
    { name: "bucket", type: "string", nullable_pct: 0 },
    { name: "count", type: "number", nullable_pct: 0 },
  ];
  const barConfig: ChartConfig = {
    id: "profile-date",
    name: "Date Distribution",
    type: "bar",
    xColumn: "bucket",
    yColumn: "count",
    createdAt: Date.now(),
  };

  return (
    <div className="flex flex-col gap-4">
      <StatGrid
        items={[
          { label: "Count", value: profile.count.toLocaleString() },
          { label: "Nulls", value: `${profile.nullCount} (${profile.nullPct}%)` },
          { label: "Min Date", value: profile.min.slice(0, 10) },
          { label: "Max Date", value: profile.max.slice(0, 10) },
          { label: "Timespan", value: profile.timespan },
        ]}
      />
      {profile.histogram.length > 0 && (
        <Chart columns={barColumns} rows={profile.histogram} config={barConfig} height={250} />
      )}
    </div>
  );
}

function ProfileContent({ profile }: { profile: ColumnProfileType }) {
  switch (profile.kind) {
    case "numeric":
      return <NumericProfile profile={profile} />;
    case "string":
      return <StringProfile profile={profile} />;
    case "date":
      return <DateProfile profile={profile} />;
  }
}

const TYPE_ICONS = {
  number: Hash,
  string: Type,
  date: Calendar,
  boolean: Type,
  unknown: Type,
} as const;

export function ColumnProfileDialog({
  open,
  onOpenChange,
  datasetType,
  tableName,
  columnName,
  columnType,
}: ColumnProfileProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["columnProfile", datasetType, tableName, columnName],
    queryFn: ({ signal }) =>
      getColumnProfile({ datasetType, tableName, columnName }, signal),
    enabled: open && !!datasetType && !!tableName && !!columnName,
  });

  const Icon = TYPE_ICONS[columnType] ?? Type;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col
                     border-l bg-white shadow-xl
                     border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between border-b px-5 py-4 border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <Icon size={14} className="text-zinc-400" />
                <Dialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {columnName}
                </Dialog.Title>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {columnType}
                </span>
              </div>
              {data && (
                <p className="mt-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                  Profiling {data.sampledRows.toLocaleString()} of{" "}
                  {data.totalRows.toLocaleString()} rows
                </p>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            {isLoading && (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
                ))}
              </div>
            )}
            {isError && (
              <p className="py-12 text-center text-sm text-red-500">
                Failed to compute profile.
              </p>
            )}
            {data && <ProfileContent profile={data.profile} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
