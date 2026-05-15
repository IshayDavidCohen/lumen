import { useQuery, useQueries } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import {
  Database,
  Table2,
  Rows3,
  Upload,
  ArrowRight,
  Search,
  FolderOpen,
} from "lucide-react";
import { getDatasetTypes, getTables } from "@/services/datasets";
import { useIngestHistoryStore } from "@/hooks/useIngestHistory";
import { StatusBadge } from "@/components/StatusBadge";
import type { TableInfo } from "@/constants/apiTypes";

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div
      className="rounded-lg border p-5
                 border-zinc-200 bg-white
                 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg
                     bg-zinc-100 dark:bg-zinc-800"
        >
          <Icon size={18} className="text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">{label}</p>
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            {value}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function DatasetOverviewCard({
  type,
  tables,
}: {
  type: string;
  tables: TableInfo[];
}) {
  const navigate = useNavigate();
  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0);

  return (
    <button
      onClick={() => navigate(`/data/${type}`)}
      className="flex items-center gap-4 rounded-lg border px-5 py-4 text-left transition-colors duration-150
                 border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50
                 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg
                   bg-zinc-100 dark:bg-zinc-800"
      >
        <Database size={16} className="text-blue-600 dark:text-blue-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {type}
        </p>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {tables.length} table{tables.length !== 1 ? "s" : ""} &middot;{" "}
          {formatRowCount(totalRows)} rows
        </p>
      </div>
      <ArrowRight
        size={14}
        className="shrink-0 text-zinc-300 dark:text-zinc-700"
      />
    </button>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const { data: typesData, isLoading: typesLoading } = useQuery({
    queryKey: ["datasetTypes"],
    queryFn: ({ signal }) => getDatasetTypes(signal),
  });

  const types = typesData?.types ?? [];

  const tableQueries = useQueries({
    queries: types.map((type) => ({
      queryKey: ["tables", type] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => getTables(type, signal),
    })),
  });

  const allTables = tableQueries.flatMap(
    (q) => q.data?.tables ?? [],
  );

  const totalTables = allTables.length;
  const totalRows = allTables.reduce((sum, t) => sum + t.row_count, 0);

  const entries = useIngestHistoryStore((s) => s.entries);
  const recentEntries = entries.slice(0, 10);
  const recentIngestCount = entries.filter(
    (e) => Date.now() - e.completedAt < 86_400_000,
  ).length;

  const quickActions = [
    { label: "Upload Files", to: "/ingest", icon: Upload },
    { label: "Run Query", to: "/data", icon: Search },
    { label: "Browse Datasets", to: "/datasets", icon: FolderOpen },
  ] as const;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
          Overview of your network data analysis workspace.
        </p>
      </div>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {typesLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
            />
          ))
        ) : (
          <>
            <StatCard
              icon={Database}
              label="Dataset Types"
              value={String(types.length)}
              description="Active dataset types"
            />
            <StatCard
              icon={Table2}
              label="Total Tables"
              value={String(totalTables)}
              description="Parsed tables"
            />
            <StatCard
              icon={Rows3}
              label="Total Rows"
              value={formatRowCount(totalRows)}
              description="Across all datasets"
            />
            <StatCard
              icon={Upload}
              label="Recent Ingests"
              value={String(recentIngestCount)}
              description="Last 24 hours"
            />
          </>
        )}
      </div>

      {/* Activity + Quick Actions */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Recent ingestion activity */}
        <div
          className="col-span-1 rounded-lg border lg:col-span-2
                     border-zinc-200 bg-white
                     dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="border-b px-5 py-3 border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Recent Ingestion Activity
            </h2>
          </div>
          {recentEntries.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                No recent ingestions.{" "}
                <Link
                  to="/ingest"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Upload files on the Ingest page.
                </Link>
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
              {recentEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => navigate(`/data/${entry.ingestType}`)}
                  className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors
                             hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
                    {entry.filename}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                    {entry.ingestType}
                  </span>
                  <StatusBadge status={entry.status} />
                  <span className="shrink-0 text-xs text-zinc-400 dark:text-zinc-600">
                    {timeAgo(entry.completedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div
          className="rounded-lg border
                     border-zinc-200 bg-white
                     dark:border-zinc-800 dark:bg-zinc-900/50"
        >
          <div className="border-b px-5 py-3 border-zinc-200 dark:border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Quick Actions
            </h2>
          </div>
          <div className="flex flex-col gap-1 p-3">
            {quickActions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors
                           text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900
                           dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <action.icon size={16} className="shrink-0 opacity-60" />
                {action.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Dataset overview cards */}
      {types.length > 0 && (
        <div>
          <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Datasets
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {types.map((type, i) => (
              <DatasetOverviewCard
                key={type}
                type={type}
                tables={tableQueries[i]?.data?.tables ?? []}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
