import {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Table2,
  ChevronRight,
  Database,
  BarChart3,
  Play,
  Clock,
  Trash2,
  X,
  Loader2,
  Save,
  Pencil,
  Bookmark,
  Terminal,
  ChevronDown,
  ChevronUp,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { getDatasetTypes, getTables, getTableData } from "@/services/datasets";
import { executeQuery } from "@/services/query";
import { DataTable } from "@/components/DataTable";
import { Chart } from "@/components/Chart";
import { ChartConfigPanel } from "@/components/ChartConfigPanel";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import {
  useQueryHistoryStore,
  createHistoryEntry,
  type QueryHistoryEntry,
} from "@/hooks/useQueryHistory";
import {
  useSavedQueries,
  useSaveQuery,
  useUpdateQuery,
  useDeleteQuery,
} from "@/hooks/useSavedQueries";
import type { SavedQuery } from "@/services/queries";
import { useToast } from "@/components/ui/Toast";
import { useThemeStore } from "@/hooks/useTheme";
import type { TableInfo, Column, ChartConfig } from "@/constants/apiTypes";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Save Dialog ───────────────────────────────────────────────

interface SaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sql: string;
  chartConfig: ChartConfig | null;
  editingQuery?: SavedQuery;
  onSaved: () => void;
}

function SaveQueryDialog({
  open,
  onOpenChange,
  sql,
  chartConfig,
  editingQuery,
  onSaved,
}: SaveDialogProps) {
  const [name, setName] = useState(editingQuery?.name ?? "");
  const [description, setDescription] = useState(editingQuery?.description ?? "");
  const [tagsStr, setTagsStr] = useState(editingQuery?.tags.join(", ") ?? "");
  const [includeChart, setIncludeChart] = useState(!!editingQuery?.chartConfig);
  const { toast } = useToast();

  const saveQuery = useSaveQuery();
  const updateQuery = useUpdateQuery();

  useEffect(() => {
    if (open) {
      setName(editingQuery?.name ?? "");
      setDescription(editingQuery?.description ?? "");
      setTagsStr(editingQuery?.tags.join(", ") ?? "");
      setIncludeChart(!!editingQuery?.chartConfig);
    }
  }, [open, editingQuery]);

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const tags = tagsStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingQuery) {
        await updateQuery.mutateAsync({
          id: editingQuery.id,
          patch: {
            name: trimmedName,
            sql,
            description: description || undefined,
            tags,
            chartConfig: includeChart && chartConfig ? chartConfig : undefined,
          },
        });
        toast("Query updated", "success");
      } else {
        await saveQuery.mutateAsync({
          name: trimmedName,
          sql,
          description: description || undefined,
          tags,
          chartConfig: includeChart && chartConfig ? chartConfig : undefined,
        });
        toast("Query saved", "success");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast("Failed to save query", "error");
    }
  }, [name, description, tagsStr, includeChart, sql, chartConfig, editingQuery, saveQuery, updateQuery, toast, onSaved, onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2
                     rounded-lg border bg-white p-6 shadow-xl
                     border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <Dialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {editingQuery ? "Edit Saved Query" : "Save Query"}
          </Dialog.Title>

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Name *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm
                           border-zinc-300 bg-white text-zinc-900
                           dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="My query"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm
                           border-zinc-300 bg-white text-zinc-900
                           dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Tags (comma-separated)
              </label>
              <input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm
                           border-zinc-300 bg-white text-zinc-900
                           dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                           focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="http, overview"
              />
            </div>
            {chartConfig && chartConfig.xColumn && (
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={includeChart}
                  onChange={(e) => setIncludeChart(e.target.checked)}
                  className="rounded"
                />
                Save chart configuration
              </label>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                className="rounded-md px-3 py-1.5 text-xs font-medium
                           text-zinc-600 hover:bg-zinc-100
                           dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={() => void handleSubmit()}
              disabled={!name.trim() || saveQuery.isPending || updateQuery.isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white
                         hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none"
            >
              {editingQuery ? "Update" : "Save"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Delete Confirmation ───────────────────────────────────────

function DeleteQueryAlert({
  open,
  onOpenChange,
  queryName,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queryName: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2
                     rounded-lg border bg-white p-6 shadow-xl
                     border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <AlertDialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Delete &ldquo;{queryName}&rdquo;?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This action cannot be undone.
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={onConfirm}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Delete
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ── Main Page ─────────────────────────────────────────────────

type ViewMode = "browse" | "query";

export default function DataPage() {
  const { type, table } = useParams<{ type?: string; table?: string }>();
  const navigate = useNavigate();

  // ── Browse-mode state ───────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sorting, setSorting] = useState<{ id: string; desc: boolean } | null>(null);

  // ── Query-mode state ────────────────────────────────
  const [sql, setSql] = useState("SELECT * FROM packets LIMIT 50;");
  const [queryResults, setQueryResults] = useState<{
    columns: Column[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null);
  const editorRef = useRef<{ getValue: () => string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Shared state ────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("browse");
  const [showEditor, setShowEditor] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [chartConfig, setChartConfig] = useState<ChartConfig>({
    id: "data-chart",
    name: "Data Chart",
    type: "bar",
    xColumn: "",
    yColumn: "",
    createdAt: Date.now(),
  });

  // ── Right sidebar state ─────────────────────────────
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"history" | "saved">("history");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [editingQuery, setEditingQuery] = useState<SavedQuery | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<SavedQuery | null>(null);

  // ── Hooks ───────────────────────────────────────────
  const { entries, addEntry, removeEntry, clearAll } = useQueryHistoryStore();
  const { data: savedData } = useSavedQueries();
  const updateQuery = useUpdateQuery();
  const deleteQuery = useDeleteQuery();
  const { toast } = useToast();
  const { theme } = useThemeStore();

  const savedQueries = savedData?.queries ?? [];

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // ── Dataset queries ─────────────────────────────────
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
  const types = typesData?.types ?? [];
  const tables = tablesData?.tables ?? [];
  const totalPages = tableData ? Math.ceil(tableData.total / pageSize) : 1;

  // ── Browse handlers ─────────────────────────────────
  const handleTableSelect = useCallback(
    (t: string) => {
      setPage(1);
      setSorting(null);
      setViewMode("browse");
      navigate(`/data/${selectedType}/${t}`);
    },
    [navigate, selectedType],
  );

  const handleTypeSelect = useCallback(
    (t: string) => {
      setPage(1);
      setSorting(null);
      setViewMode("browse");
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

  // ── Query handlers ──────────────────────────────────
  const handleExecute = useCallback(async (override?: string) => {
    const query = override ?? editorRef.current?.getValue() ?? sql;
    const trimmed = query.trim();
    if (!trimmed) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsRunning(true);
    const start = performance.now();

    try {
      const response = await executeQuery(trimmed, controller.signal);
      const duration = Math.round(performance.now() - start);

      setQueryResults({
        columns: response.columns,
        rows: response.rows,
        rowCount: response.row_count,
        durationMs: duration,
      });
      setViewMode("query");

      addEntry(createHistoryEntry(trimmed, response.row_count, duration));

      if (activeQueryId) {
        void updateQuery.mutateAsync({
          id: activeQueryId,
          patch: {
            lastRunAt: Date.now(),
            lastRunRowCount: response.row_count,
            lastRunDurationMs: duration,
          },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      if (message !== "Request was cancelled") {
        toast(message, "error");
      }
    } finally {
      setIsRunning(false);
    }
  }, [sql, addEntry, toast, activeQueryId, updateQuery]);

  // Other pages link here with ?sql=… (e.g. a batch's rows): load it into the
  // editor, run it once, then drop the param so the URL doesn't go stale.
  const [searchParams, setSearchParams] = useSearchParams();
  const incomingSql = searchParams.get("sql");
  const consumedSqlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!incomingSql) {
      consumedSqlRef.current = null; // so the same link works again next time
      return;
    }
    if (consumedSqlRef.current === incomingSql) return;
    consumedSqlRef.current = incomingSql;
    setSql(incomingSql);
    setActiveQueryId(null);
    setShowEditor(true);
    void handleExecute(incomingSql);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("sql");
        return next;
      },
      { replace: true },
    );
  }, [incomingSql, handleExecute, setSearchParams]);

  const handleHistoryClick = useCallback((entry: QueryHistoryEntry) => {
    setSql(entry.sql);
    setActiveQueryId(null);
    setShowEditor(true);
  }, []);

  const handleSavedClick = useCallback((query: SavedQuery) => {
    setSql(query.sql);
    setActiveQueryId(query.id);
    setShowEditor(true);
    if (query.chartConfig) {
      setChartConfig(query.chartConfig);
      setShowChart(true);
    }
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteQuery.mutateAsync(deleteTarget.id);
      if (activeQueryId === deleteTarget.id) setActiveQueryId(null);
      toast("Query deleted", "info");
    } catch {
      toast("Failed to delete query", "error");
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteQuery, activeQueryId, toast]);

  // ── Keyboard shortcuts (merged data + query) ───────
  const shortcutHandlers = useMemo(
    () => ({
      "next-page": () => {
        if (viewMode === "browse") setPage((p) => Math.min(p + 1, totalPages));
      },
      "prev-page": () => {
        if (viewMode === "browse") setPage((p) => Math.max(p - 1, 1));
      },
      "export-csv": () => {},
      "execute-query": () => void handleExecute(),
      "save-query": () => {
        setEditingQuery(undefined);
        setShowSaveDialog(true);
      },
      "toggle-history": () => setShowSidebar((prev) => !prev),
      "toggle-chart": () => setShowChart((prev) => !prev),
    }),
    [totalPages, viewMode, handleExecute],
  );
  useKeyboardShortcuts("data", shortcutHandlers);

  const isBrowse = viewMode === "browse";

  // ── Empty state ────────────────────────────────────
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
      {/* ── Left sidebar: tables ────────────────────── */}
      <aside
        className="flex w-60 shrink-0 flex-col border-r overflow-y-auto
                    border-zinc-200 bg-zinc-50
                    dark:border-zinc-800 dark:bg-zinc-950"
      >
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

        <nav className="flex-1 py-1">
          {tablesLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mx-3 my-1.5 h-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              ))
            : tables.map((t: TableInfo) => {
                const isActive = t.name === selectedTable && isBrowse;
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

      {/* ── Center: editor + results ────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* SQL editor panel (collapsible) */}
        <div className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between px-4 py-1.5">
            <button
              onClick={() => setShowEditor((s) => !s)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
              <Terminal size={12} />
              SQL Editor
              {showEditor ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                Ctrl+Enter to run
              </span>
              <button
                onClick={() => setShowChart((s) => !s)}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150
                  ${
                    showChart
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  }`}
                title="Toggle chart view"
              >
                <BarChart3 size={12} />
                Chart
              </button>
              <button
                onClick={() => {
                  setEditingQuery(undefined);
                  setShowSaveDialog(true);
                }}
                className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150
                           text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700
                           dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title="Save query"
              >
                <Save size={12} />
                Save
              </button>
              <button
                onClick={() => void handleExecute()}
                disabled={isRunning}
                className="flex h-7 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white
                           hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none
                           transition-colors duration-150"
              >
                {isRunning ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Play size={12} />
                )}
                {isRunning ? "Running…" : "Execute"}
              </button>
              <button
                onClick={() => setShowSidebar((s) => !s)}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150
                  ${
                    showSidebar
                      ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
                      : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  }`}
                title="Toggle history & saved sidebar"
              >
                {showSidebar ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              </button>
            </div>
          </div>

          {showEditor && (
            <div className="h-[200px] border-t border-zinc-200 dark:border-zinc-800">
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center bg-white dark:bg-zinc-950">
                    <Loader2 size={20} className="animate-spin text-zinc-400 dark:text-zinc-600" />
                  </div>
                }
              >
                <MonacoEditor
                  height="200px"
                  defaultLanguage="sql"
                  value={sql}
                  onChange={(v) => setSql(v ?? "")}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  theme={theme === "dark" ? "vs-dark" : "light"}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: "'Geist Mono', monospace",
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 8 },
                    renderLineHighlight: "gutter",
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollbar: { vertical: "hidden" },
                  }}
                />
              </Suspense>
            </div>
          )}
        </div>

        {/* Results area */}
        <div className="flex-1 overflow-auto p-4">
          {/* Header: breadcrumb (browse) or query stats */}
          <div className="mb-3 flex items-center gap-2">
            {isBrowse && selectedTable ? (
              <>
                <span className="text-xs text-zinc-400 dark:text-zinc-500">{selectedType}</span>
                <ChevronRight size={12} className="text-zinc-300 dark:text-zinc-700" />
                <h1 className="font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                  {selectedTable}
                </h1>
              </>
            ) : queryResults ? (
              <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                <Terminal size={12} />
                <span className="font-medium text-zinc-600 dark:text-zinc-300">Query results</span>
                <span className="font-mono">
                  {queryResults.rowCount} row{queryResults.rowCount !== 1 ? "s" : ""}
                </span>
                <span>in {formatDuration(queryResults.durationMs)}</span>
              </div>
            ) : null}
          </div>

          {/* Table or query results */}
          {isBrowse ? (
            selectedTable && tableInfo ? (
              <div className="flex h-[calc(100%-2rem)] flex-col">
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
                  datasetType={selectedType ?? undefined}
                  tableName={selectedTable ?? undefined}
                />
                {showChart && (tableData?.rows.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-col gap-3">
                    <ChartConfigPanel
                      columns={tableInfo.columns}
                      rows={tableData?.rows ?? []}
                      config={chartConfig}
                      onChange={setChartConfig}
                    />
                    {chartConfig.xColumn && (
                      <Chart
                        columns={tableInfo.columns}
                        rows={tableData?.rows ?? []}
                        config={chartConfig}
                        height={350}
                      />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-400 dark:text-zinc-600">
                  Select a table from the sidebar
                </p>
              </div>
            )
          ) : queryResults ? (
            <div className="flex flex-col gap-2">
              <DataTable
                columns={queryResults.columns}
                rows={queryResults.rows}
                total={queryResults.rowCount}
                page={1}
                pageSize={queryResults.rowCount}
                onPageChange={() => {}}
                onPageSizeChange={() => {}}
                onSortChange={() => {}}
                sorting={null}
              />
              {showChart && queryResults.columns.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  <ChartConfigPanel
                    columns={queryResults.columns}
                    rows={queryResults.rows}
                    config={chartConfig}
                    onChange={setChartConfig}
                  />
                  {chartConfig.xColumn && (
                    <Chart
                      columns={queryResults.columns}
                      rows={queryResults.rows}
                      config={chartConfig}
                      height={350}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-400 dark:text-zinc-600">
                {showEditor
                  ? "Write a query and press Execute to see results"
                  : "Select a table from the sidebar"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right sidebar: history & saved ──────────── */}
      {showSidebar && (
        <aside
          className="flex w-72 shrink-0 flex-col border-l overflow-hidden
                      border-zinc-200 bg-zinc-50
                      dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between border-b px-2 py-1.5 border-zinc-200 dark:border-zinc-800">
            <div className="flex">
              <button
                onClick={() => setSidebarTab("history")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors
                  ${sidebarTab === "history" ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"}`}
              >
                <Clock size={12} />
                History
              </button>
              <button
                onClick={() => setSidebarTab("saved")}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors
                  ${sidebarTab === "saved" ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"}`}
              >
                <Bookmark size={12} />
                Saved
              </button>
            </div>
            <div className="flex items-center gap-1">
              {sidebarTab === "history" && entries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="rounded p-1 transition-colors text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
                  title="Clear history"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                onClick={() => setShowSidebar(false)}
                className="rounded p-1 transition-colors text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sidebarTab === "history" ? (
              entries.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
                  No queries yet
                </p>
              ) : (
                entries.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => handleHistoryClick(entry)}
                    className="group flex w-full flex-col gap-1 border-b px-4 py-2.5 text-left transition-colors
                               border-zinc-100 hover:bg-zinc-100
                               dark:border-zinc-800/50 dark:hover:bg-zinc-900"
                  >
                    <p className="line-clamp-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                      {entry.sql}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-600">
                      <span>{entry.rowCount} rows</span>
                      <span>{formatDuration(entry.durationMs)}</span>
                      <span className="ml-auto">{formatTime(entry.executedAt)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEntry(entry.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5
                                   hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </button>
                ))
              )
            ) : savedQueries.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-zinc-400 dark:text-zinc-600">
                No saved queries
              </p>
            ) : (
              savedQueries.map((sq) => (
                <button
                  key={sq.id}
                  onClick={() => handleSavedClick(sq)}
                  className={`group flex w-full flex-col gap-1 border-b px-4 py-2.5 text-left transition-colors
                    border-zinc-100 dark:border-zinc-800/50
                    ${activeQueryId === sq.id ? "bg-blue-50 dark:bg-blue-500/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-900"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {sq.name}
                    </span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingQuery(sq);
                          setShowSaveDialog(true);
                        }}
                        className="rounded p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(sq);
                        }}
                        className="rounded p-0.5 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  <p className="line-clamp-1 font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
                    {sq.sql.slice(0, 60)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    {sq.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-600
                                   dark:bg-zinc-800 dark:text-zinc-400"
                      >
                        {tag}
                      </span>
                    ))}
                    {sq.lastRunAt && (
                      <span className="ml-auto text-[9px] text-zinc-400 dark:text-zinc-600">
                        {sq.lastRunRowCount != null ? `${sq.lastRunRowCount} rows` : ""}
                        {sq.lastRunDurationMs != null ? ` · ${formatDuration(sq.lastRunDurationMs)}` : ""}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Dialogs */}
      <SaveQueryDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        sql={editorRef.current?.getValue() ?? sql}
        chartConfig={showChart && chartConfig.xColumn ? chartConfig : null}
        editingQuery={editingQuery}
        onSaved={() => setEditingQuery(undefined)}
      />
      <DeleteQueryAlert
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        queryName={deleteTarget?.name ?? ""}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}
