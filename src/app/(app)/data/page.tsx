import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Table2, ChevronRight, Database } from "lucide-react";
import { getDatasetTypes, getTables, getTableData } from "@/services/datasets";
import { DataTable } from "@/components/DataTable";
import type { TableInfo } from "@/constants/apiTypes";

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function DataPage() {
  const { type, table } = useParams<{ type?: string; table?: string }>();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sorting, setSorting] = useState<{ id: string; desc: boolean } | null>(null);

  const { data: typesData } = useQuery({
    queryKey: ["datasetTypes"],
    queryFn: ({ signal }) => getDatasetTypes(signal),
  });

  const selectedType = type ?? typesData?.types[0] ?? null;

  const { data: tablesData, isLoading: tablesLoading } = useQuery({
    queryKey: ["tables", selectedType],
    queryFn: ({ signal }) => getTables(selectedType!, signal),
    enabled: !!selectedType,
  });

  const selectedTable = table ?? tablesData?.tables[0]?.name ?? null;

  const { data: tableData, isLoading: dataLoading } = useQuery({
    queryKey: ["tableData", selectedType, selectedTable, page, pageSize, sorting],
    queryFn: ({ signal }) =>
      getTableData({
        type: selectedType!,
        name: selectedTable!,
        page,
        pageSize,
        sortBy: sorting?.id,
        sortDir: sorting ? (sorting.desc ? "desc" : "asc") : undefined,
        signal,
      }),
    enabled: !!selectedType && !!selectedTable,
  });

  const tableInfo = tablesData?.tables.find((t: TableInfo) => t.name === selectedTable);

  const handleTableSelect = useCallback(
    (t: string) => {
      setPage(1);
      setSorting(null);
      navigate(`/data/${selectedType}/${t}`);
    },
    [navigate, selectedType],
  );

  const handleTypeSelect = useCallback(
    (t: string) => {
      setPage(1);
      setSorting(null);
      navigate(`/data/${t}`);
    },
    [navigate],
  );

  const handleSortChange = useCallback(
    (columnId: string, direction: "asc" | "desc" | null) => {
      setPage(1);
      setSorting(direction ? { id: columnId, desc: direction === "desc" } : null);
    },
    [],
  );

  const handlePageSizeChange = useCallback((size: number) => {
    setPage(1);
    setPageSize(size);
  }, []);

  const types = typesData?.types ?? [];
  const tables = tablesData?.tables ?? [];

  if (!selectedType && types.length === 0) {
    return (
      <div className="flex h-[calc(100vh-56px)] items-center justify-center">
        <p className="text-sm text-zinc-400 dark:text-zinc-500">
          No datasets available. Upload files on the Ingest page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside
        className="flex w-60 shrink-0 flex-col border-r overflow-y-auto
                    border-zinc-200 bg-zinc-50
                    dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* Type selector */}
        {types.length > 1 && (
          <div className="border-b px-3 py-2 border-zinc-200 dark:border-zinc-800">
            <select
              value={selectedType ?? ""}
              onChange={(e) => handleTypeSelect(e.target.value)}
              className="w-full rounded-md border px-2 py-1.5 text-xs font-medium
                         border-zinc-300 bg-white text-zinc-700
                         dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        )}

        {types.length === 1 && (
          <div className="flex items-center gap-2 border-b px-4 py-3 border-zinc-200 dark:border-zinc-800">
            <Database size={14} className="text-zinc-400 dark:text-zinc-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {selectedType}
            </span>
          </div>
        )}

        {/* Tables list */}
        <nav className="flex-1 py-1">
          {tablesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mx-3 my-1.5 h-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              ))
            : tables.map((t: TableInfo) => {
                const isActive = t.name === selectedTable;
                return (
                  <button
                    key={t.name}
                    onClick={() => handleTableSelect(t.name)}
                    className={`
                      flex w-full items-center gap-2 px-4 py-2 text-left text-sm
                      transition-colors duration-100
                      ${
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-zinc-800 dark:text-zinc-100"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                      }
                    `.trim()}
                  >
                    <Table2 size={14} className="shrink-0 opacity-60" />
                    <span className="flex-1 truncate font-mono text-xs">{t.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums opacity-50">
                      {formatRowCount(t.row_count)}
                    </span>
                  </button>
                );
              })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-hidden p-6">
        {selectedTable && tableInfo ? (
          <div className="flex h-full flex-col">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xs text-zinc-400 dark:text-zinc-500">{selectedType}</span>
              <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700" />
              <h1 className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {selectedTable}
              </h1>
            </div>
            <div className="flex-1 overflow-auto">
              <DataTable
                columns={tableInfo.columns}
                rows={tableData?.rows ?? []}
                total={tableData?.total ?? 0}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                onSortChange={handleSortChange}
                sorting={sorting}
                isLoading={dataLoading}
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-400 dark:text-zinc-600">
              Select a table from the sidebar
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
