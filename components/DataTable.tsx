import { useState, useCallback, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  HelpCircle,
  BarChart2,
  FileSpreadsheet,
  FileJson,
  Copy,
  Loader2,
} from "lucide-react";
import { ColumnProfileDialog } from "@/components/ColumnProfile";
import { useToast } from "@/components/ui/Toast";
import {
  rowsToCsv,
  rowsToJson,
  rowsToTsv,
  downloadAsFile,
  copyToClipboard,
} from "@/lib/exportUtils";
import { getAllTableData } from "@/services/datasets";
import type { Column } from "@/constants/apiTypes";

interface DataTableProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onSortChange: (columnId: string, direction: "asc" | "desc" | null) => void;
  sorting?: { id: string; desc: boolean } | null;
  isLoading?: boolean;
  datasetType?: string;
  tableName?: string;
}

const TYPE_ICONS: Record<Column["type"], typeof Hash> = {
  number: Hash,
  string: Type,
  date: Calendar,
  boolean: ToggleLeft,
  unknown: HelpCircle,
};

function formatCellValue(value: unknown, colType: Column["type"]): string {
  if (value === null || value === undefined) return "—";
  if (colType === "number" && typeof value === "number") {
    return value.toLocaleString();
  }
  if (colType === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleString();
    } catch {
      return String(value);
    }
  }
  if (colType === "boolean") return value ? "true" : "false";
  return String(value);
}

const PAGE_SIZES = [25, 50, 100];

export function DataTable({
  columns: apiColumns,
  rows,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  sorting: externalSort,
  isLoading,
  datasetType,
  tableName,
}: DataTableProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [profileColumn, setProfileColumn] = useState<{ name: string; type: Column["type"] } | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const { toast } = useToast();

  const tableSorting: SortingState = externalSort
    ? [{ id: externalSort.id, desc: externalSort.desc }]
    : [];

  const tableColumns = useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      apiColumns.map((col) => ({
        id: col.name,
        accessorKey: col.name,
        header: () => col.name,
        cell: (info) => formatCellValue(info.getValue(), col.type),
        meta: { colType: col.type, nullablePct: col.nullable_pct },
      })),
    [apiColumns],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    state: {
      sorting: tableSorting,
      columnFilters,
    },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const { getHeaderGroups, getRowModel } = table;
  const tableRows = getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  const handleSort = useCallback(
    (colId: string) => {
      if (externalSort?.id === colId) {
        if (!externalSort.desc) {
          onSortChange(colId, "desc");
        } else {
          onSortChange(colId, null);
        }
      } else {
        onSortChange(colId, "asc");
      }
    },
    [externalSort, onSortChange],
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
          {total.toLocaleString()} row{total !== 1 ? "s" : ""}
        </span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-150
                         text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700
                         dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download size={12} />
              Export
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="z-50 min-w-[180px] rounded-md border bg-white p-1 shadow-lg
                         border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
              align="end"
              sideOffset={4}
            >
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                           text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onSelect={() => {
                  const csv = rowsToCsv(apiColumns, rows);
                  downloadAsFile(csv, `export-${Date.now()}.csv`, "text/csv");
                }}
              >
                <FileSpreadsheet size={12} /> Export as CSV
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                           text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onSelect={() => {
                  const json = rowsToJson(rows);
                  downloadAsFile(json, `export-${Date.now()}.json`, "application/json");
                }}
              >
                <FileJson size={12} /> Export as JSON
              </DropdownMenu.Item>

              {datasetType && tableName && (
                <>
                  <DropdownMenu.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                  {total > 100_000 ? (
                    <DropdownMenu.Item
                      className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs
                                 text-zinc-400 dark:text-zinc-600"
                      disabled
                    >
                      <Download size={12} /> Export all — too many rows
                    </DropdownMenu.Item>
                  ) : (
                    <>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                                   text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        disabled={exportingAll}
                        onSelect={() => {
                          setExportingAll(true);
                          setExportProgress("0%");
                          void getAllTableData(
                            { type: datasetType, name: tableName },
                            (fetched, t) => setExportProgress(`${Math.round((fetched / t) * 100)}%`),
                          ).then((result) => {
                            const csv = rowsToCsv(result.columns, result.rows);
                            downloadAsFile(csv, `export-all-${Date.now()}.csv`, "text/csv");
                            toast(`Exported ${result.rows.length} rows as CSV`, "success");
                          }).finally(() => {
                            setExportingAll(false);
                            setExportProgress("");
                          });
                        }}
                      >
                        {exportingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {exportingAll ? `Fetching... ${exportProgress}` : `Export all as CSV (${total.toLocaleString()} rows)`}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item
                        className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                                   text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        disabled={exportingAll}
                        onSelect={() => {
                          setExportingAll(true);
                          setExportProgress("0%");
                          void getAllTableData(
                            { type: datasetType, name: tableName },
                            (fetched, t) => setExportProgress(`${Math.round((fetched / t) * 100)}%`),
                          ).then((result) => {
                            const json = rowsToJson(result.rows);
                            downloadAsFile(json, `export-all-${Date.now()}.json`, "application/json");
                            toast(`Exported ${result.rows.length} rows as JSON`, "success");
                          }).finally(() => {
                            setExportingAll(false);
                            setExportProgress("");
                          });
                        }}
                      >
                        {exportingAll ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        {exportingAll ? `Fetching... ${exportProgress}` : `Export all as JSON (${total.toLocaleString()} rows)`}
                      </DropdownMenu.Item>
                    </>
                  )}
                </>
              )}

              <DropdownMenu.Separator className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                           text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onSelect={() => {
                  const tsv = rowsToTsv(apiColumns, rows);
                  void copyToClipboard(tsv).then((ok) => {
                    toast(ok ? `Copied ${rows.length} rows to clipboard` : "Failed to copy", ok ? "success" : "error");
                  });
                }}
              >
                <Copy size={12} /> Copy to clipboard
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none
                           text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onSelect={() => {
                  const json = rowsToJson(rows, false);
                  void copyToClipboard(json).then((ok) => {
                    toast(ok ? `Copied ${rows.length} rows as JSON` : "Failed to copy", ok ? "success" : "error");
                  });
                }}
              >
                <Copy size={12} /> Copy as JSON
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      {/* Table */}
        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div ref={parentRef} className="max-h-[600px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              {getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="bg-zinc-50 dark:bg-zinc-900">
                  {hg.headers.map((header) => {
                    const meta = header.column.columnDef.meta as
                      | { colType: Column["type"]; nullablePct: number }
                      | undefined;
                    const TypeIcon = meta ? TYPE_ICONS[meta.colType] : HelpCircle;
                    const isSorted = externalSort?.id === header.id;
                    const isDesc = isSorted && externalSort?.desc;

                    return (
                      <th
                        key={header.id}
                        className="group/th border-b px-3 py-2 text-left font-medium
                                   border-zinc-200 text-zinc-600
                                   dark:border-zinc-800 dark:text-zinc-400"
                      >
                        <button
                          onClick={() => handleSort(header.id)}
                          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                        >
                          <TypeIcon size={12} className="shrink-0 opacity-50" />
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {isSorted ? (
                            isDesc ? (
                              <ArrowDown size={12} className="shrink-0 text-blue-400" />
                            ) : (
                              <ArrowUp size={12} className="shrink-0 text-blue-400" />
                            )
                          ) : (
                            <ArrowUpDown size={12} className="shrink-0 opacity-30" />
                          )}
                          {meta && meta.nullablePct > 0 && (
                            <span className="ml-1 text-[10px] opacity-40">{meta.nullablePct}% null</span>
                          )}
                        </button>
                        {datasetType && tableName && meta && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setProfileColumn({ name: header.id, type: meta.colType });
                            }}
                            className="ml-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover/th:opacity-100
                                       text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400"
                            title={`Profile ${header.id}`}
                          >
                            <BarChart2 size={12} />
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {apiColumns.map((col) => (
                      <td key={col.name} className="border-b px-3 py-2 border-zinc-100 dark:border-zinc-800/50">
                        <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tableRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={apiColumns.length}
                    className="px-3 py-12 text-center text-sm text-zinc-400 dark:text-zinc-600"
                  >
                    No data
                  </td>
                </tr>
              ) : (
                <>
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td
                        colSpan={apiColumns.length}
                        style={{ height: virtualizer.getVirtualItems()[0]!.start }}
                      />
                    </tr>
                  )}
                  {virtualizer.getVirtualItems().map((vRow) => {
                    const row = tableRows[vRow.index]!;
                    return (
                      <tr
                        key={row.id}
                        ref={virtualizer.measureElement}
                        data-index={vRow.index}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors duration-75"
                      >
                        {row.getVisibleCells().map((cell) => {
                          const meta = cell.column.columnDef.meta as
                            | { colType: Column["type"] }
                            | undefined;
                          const isNum = meta?.colType === "number";
                          const isMono = isNum || meta?.colType === "date";
                          const val = cell.getValue();
                          const isNull = val === null || val === undefined;

                          return (
                            <td
                              key={cell.id}
                              className={`
                                border-b px-3 py-1.5 truncate max-w-[300px]
                                border-zinc-100 dark:border-zinc-800/50
                                ${isMono ? "font-mono" : ""}
                                ${isNum ? "text-right" : ""}
                                ${isNull ? "text-zinc-300 dark:text-zinc-700 italic" : "text-zinc-700 dark:text-zinc-300"}
                              `.trim()}
                              title={String(val ?? "")}
                            >
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {virtualizer.getVirtualItems().length > 0 && (
                    <tr>
                      <td
                        colSpan={apiColumns.length}
                        style={{
                          height:
                            virtualizer.getTotalSize() -
                            (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                        }}
                      />
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded border px-1.5 text-xs
                       border-zinc-300 bg-white text-zinc-700
                       dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-2 text-xs font-mono text-zinc-400 dark:text-zinc-500">
            Page {page} of {totalPages || 1}
          </span>
          <PagBtn onClick={() => onPageChange(1)} disabled={page <= 1}>
            <ChevronsLeft size={14} />
          </PagBtn>
          <PagBtn onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeft size={14} />
          </PagBtn>
          <PagBtn onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            <ChevronRight size={14} />
          </PagBtn>
          <PagBtn onClick={() => onPageChange(totalPages)} disabled={page >= totalPages}>
            <ChevronsRight size={14} />
          </PagBtn>
        </div>
      </div>

      {/* Column profile dialog */}
      {datasetType && tableName && profileColumn && (
        <ColumnProfileDialog
          open={!!profileColumn}
          onOpenChange={(open) => { if (!open) setProfileColumn(null); }}
          datasetType={datasetType}
          tableName={tableName}
          columnName={profileColumn.name}
          columnType={profileColumn.type}
        />
      )}
    </div>
  );
}

function PagBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded
                 transition-colors duration-150
                 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700
                 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200
                 disabled:opacity-30 disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}
