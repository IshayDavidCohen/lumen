import { useState, useCallback, useRef, lazy, Suspense } from "react";
import { Play, Clock, Trash2, X, Loader2 } from "lucide-react";
import { executeQuery } from "@/services/query";
import { DataTable } from "@/components/DataTable";
import {
  useQueryHistoryStore,
  createHistoryEntry,
  type QueryHistoryEntry,
} from "@/hooks/useQueryHistory";
import { useToast } from "@/components/ui/Toast";
import type { Column } from "@/constants/apiTypes";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function QueryPage() {
  const [sql, setSql] = useState("SELECT * FROM packets LIMIT 50;");
  const [results, setResults] = useState<{
    columns: Column[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
  } | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showHistory, setShowHistory] = useState(true);
  const editorRef = useRef<{ getValue: () => string } | null>(null);

  const { entries, addEntry, removeEntry, clearAll } = useQueryHistoryStore();
  const { toast } = useToast();

  const handleExecute = useCallback(async () => {
    const query = editorRef.current?.getValue() ?? sql;
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsRunning(true);
    const start = performance.now();

    try {
      const response = await executeQuery(trimmed);
      const duration = Math.round(performance.now() - start);

      setResults({
        columns: response.columns,
        rows: response.rows,
        rowCount: response.row_count,
        durationMs: duration,
      });

      addEntry(createHistoryEntry(trimmed, response.row_count, duration));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Query failed";
      toast(message, "error");
      if (import.meta.env.DEV) {
        console.error("Query error:", err);
      }
    } finally {
      setIsRunning(false);
    }
  }, [sql, addEntry, toast]);

  const handleHistoryClick = useCallback((entry: QueryHistoryEntry) => {
    setSql(entry.sql);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void handleExecute();
      }
    },
    [handleExecute],
  );

  return (
    <div className="flex h-[calc(100vh-56px)]" onKeyDown={handleKeyDown}>
      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Editor */}
        <div className="border-b dark:border-zinc-800 light:border-zinc-200">
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-xs font-medium dark:text-zinc-500 light:text-zinc-400">
              SQL Editor
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] dark:text-zinc-600 light:text-zinc-400">
                Ctrl+Enter to run
              </span>
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
                {isRunning ? "Running..." : "Execute"}
              </button>
            </div>
          </div>
          <div className="h-[200px]">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center dark:bg-zinc-950 light:bg-white">
                  <Loader2 size={20} className="animate-spin dark:text-zinc-600 light:text-zinc-400" />
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
                theme="vs-dark"
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
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto p-4">
          {results ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-xs dark:text-zinc-500 light:text-zinc-400">
                <span className="font-mono">
                  {results.rowCount} row{results.rowCount !== 1 ? "s" : ""}
                </span>
                <span>in {formatDuration(results.durationMs)}</span>
              </div>
              <DataTable
                columns={results.columns}
                rows={results.rows}
                total={results.rowCount}
                page={1}
                pageSize={results.rowCount}
                onPageChange={() => {}}
                onPageSizeChange={() => {}}
                onSortChange={() => {}}
                sorting={null}
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm dark:text-zinc-600 light:text-zinc-400">
                Write a query and press Execute to see results
              </p>
            </div>
          )}
        </div>
      </div>

      {/* History sidebar */}
      {showHistory && (
        <aside
          className="flex w-72 shrink-0 flex-col border-l overflow-hidden
                      dark:border-zinc-800 dark:bg-zinc-950
                      light:border-zinc-200 light:bg-zinc-50"
        >
          <div className="flex items-center justify-between border-b px-4 py-2.5 dark:border-zinc-800 light:border-zinc-200">
            <div className="flex items-center gap-1.5">
              <Clock size={13} className="dark:text-zinc-500 light:text-zinc-400" />
              <span className="text-xs font-medium dark:text-zinc-400 light:text-zinc-600">History</span>
            </div>
            <div className="flex items-center gap-1">
              {entries.length > 0 && (
                <button
                  onClick={clearAll}
                  className="rounded p-1 transition-colors dark:text-zinc-600 dark:hover:text-zinc-400 light:text-zinc-400 light:hover:text-zinc-600"
                  title="Clear history"
                >
                  <Trash2 size={12} />
                </button>
              )}
              <button
                onClick={() => setShowHistory(false)}
                className="rounded p-1 transition-colors dark:text-zinc-600 dark:hover:text-zinc-400 light:text-zinc-400 light:hover:text-zinc-600"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs dark:text-zinc-600 light:text-zinc-400">
                No queries yet
              </p>
            ) : (
              entries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistoryClick(entry)}
                  className="group flex w-full flex-col gap-1 border-b px-4 py-2.5 text-left transition-colors
                             dark:border-zinc-800/50 dark:hover:bg-zinc-900
                             light:border-zinc-100 light:hover:bg-zinc-100"
                >
                  <p className="line-clamp-2 font-mono text-xs dark:text-zinc-400 light:text-zinc-600">
                    {entry.sql}
                  </p>
                  <div className="flex items-center gap-2 text-[10px] dark:text-zinc-600 light:text-zinc-400">
                    <span>{entry.rowCount} rows</span>
                    <span>{formatDuration(entry.durationMs)}</span>
                    <span className="ml-auto">{formatTime(entry.executedAt)}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeEntry(entry.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5
                                 dark:hover:text-zinc-300 light:hover:text-zinc-700"
                    >
                      <X size={10} />
                    </button>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>
      )}

      {!showHistory && (
        <button
          onClick={() => setShowHistory(true)}
          className="absolute right-4 top-20 z-10 flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs
                     transition-colors duration-150
                     dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200
                     light:border-zinc-300 light:bg-white light:text-zinc-500 light:hover:text-zinc-700 light:shadow-sm"
        >
          <Clock size={12} />
          History
        </button>
      )}
    </div>
  );
}
