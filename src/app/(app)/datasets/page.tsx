import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Database, Table2, Rows3, Columns3, ChevronRight } from "lucide-react";
import { getDatasetTypes, getTables } from "@/services/datasets";
import type { TableInfo } from "@/constants/apiTypes";

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function DatasetTypeCard({ type }: { type: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["tables", type],
    queryFn: () => getTables(type),
  });

  const tables = data?.tables ?? [];
  const totalRows = tables.reduce((sum, t) => sum + t.row_count, 0);
  const totalCols = tables.reduce((sum, t) => sum + t.columns.length, 0);

  return (
    <div
      className="rounded-lg border transition-colors duration-150
                 dark:border-zinc-800 dark:bg-zinc-900/50
                 light:border-zinc-200 light:bg-white light:shadow-sm"
    >
      <div className="flex items-center gap-3 border-b px-5 py-4 dark:border-zinc-800 light:border-zinc-200">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg dark:bg-zinc-800 light:bg-zinc-100">
          <Database size={18} className="dark:text-blue-400 light:text-blue-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold dark:text-zinc-100 light:text-zinc-900">{type}</h2>
          {!isLoading && (
            <div className="mt-0.5 flex items-center gap-3 text-xs dark:text-zinc-500 light:text-zinc-400">
              <span className="flex items-center gap-1">
                <Table2 size={11} /> {tables.length} table{tables.length !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1">
                <Rows3 size={11} /> {formatRowCount(totalRows)} rows
              </span>
              <span className="flex items-center gap-1">
                <Columns3 size={11} /> {totalCols} columns
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="divide-y dark:divide-zinc-800/60 light:divide-zinc-100">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="h-4 w-32 animate-pulse rounded dark:bg-zinc-800 light:bg-zinc-200" />
              </div>
            ))
          : tables.map((table: TableInfo) => (
              <button
                key={table.name}
                onClick={() => navigate(`/data/${type}/${table.name}`)}
                className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors duration-150
                           dark:hover:bg-zinc-800/50 light:hover:bg-zinc-50"
              >
                <Table2 size={14} className="shrink-0 dark:text-zinc-600 light:text-zinc-400" />
                <span className="flex-1 truncate font-mono text-sm dark:text-zinc-300 light:text-zinc-700">
                  {table.name}
                </span>
                <span className="shrink-0 font-mono text-xs dark:text-zinc-600 light:text-zinc-400">
                  {formatRowCount(table.row_count)} rows
                </span>
                <span className="shrink-0 text-xs dark:text-zinc-600 light:text-zinc-400">
                  {table.columns.length} col{table.columns.length !== 1 ? "s" : ""}
                </span>
                <ChevronRight size={14} className="shrink-0 dark:text-zinc-700 light:text-zinc-300" />
              </button>
            ))}
        {!isLoading && tables.length === 0 && (
          <p className="px-5 py-4 text-center text-sm dark:text-zinc-600 light:text-zinc-400">
            No tables found
          </p>
        )}
      </div>
    </div>
  );
}

export default function DatasetsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["datasetTypes"],
    queryFn: getDatasetTypes,
  });

  const types = data?.types ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold dark:text-zinc-100 light:text-zinc-900">
          Datasets
        </h1>
        <p className="mt-1 text-sm dark:text-zinc-500 light:text-zinc-500">
          Browse ingested dataset types and their tables.
        </p>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-lg dark:bg-zinc-800 light:bg-zinc-200"
            />
          ))}
        </div>
      )}

      {isError && (
        <p className="py-20 text-center text-sm text-red-400">
          Failed to load dataset types.
        </p>
      )}

      {!isLoading && !isError && (
        <div className="flex flex-col gap-4">
          {types.map((type) => (
            <DatasetTypeCard key={type} type={type} />
          ))}
          {types.length === 0 && (
            <p className="py-20 text-center text-sm dark:text-zinc-600 light:text-zinc-400">
              No datasets available. Upload files on the Ingest page.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
