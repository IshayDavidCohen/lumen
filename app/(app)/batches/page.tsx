import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search, Trash2, Upload } from "lucide-react";
import {
  deleteBatch,
  getBatch,
  listBatches,
  type BatchDetail,
  type BatchFile,
  type BatchFileCounts,
  type BatchListResponse,
  type BatchSummary,
} from "@/services/batches";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { STATUS_CONFIG } from "@/constants/uploadStatus";
import { formatFileSize } from "@/constants/fileTypes";
import type { UploadStatus } from "@/constants/apiTypes";

const POLL_INTERVAL_MS = 3_000;

// Shared by the column header and each batch row so they line up.
const ROW_COLUMNS =
  "md:grid md:grid-cols-[1rem_minmax(0,12rem)_minmax(0,10rem)_minmax(0,8rem)_minmax(0,1fr)_10rem_4rem_6rem]";

const PAGE_SIZE_OPTIONS = [10, 20, 50];
const DEFAULT_PAGE_SIZE = 20;

// ── Batch status (derived from per-file counts) ───────────────

type BatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";

const BATCH_STATUS_STYLES: Record<
  BatchStatus,
  { label: string; classes: string; dot: string }
> = {
  QUEUED: {
    label: "Queued",
    classes: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  PROCESSING: {
    label: "Processing",
    classes: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
    dot: "bg-teal-500 animate-pulse",
  },
  COMPLETED: {
    label: "Completed",
    classes: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
    dot: "bg-green-500",
  },
  COMPLETED_WITH_ERRORS: {
    label: "Completed with errors",
    classes: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  FAILED: {
    label: "Failed",
    classes: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    dot: "bg-red-500",
  },
};

function countOf(counts: BatchFileCounts, status: UploadStatus): number {
  return counts[status] ?? 0;
}

function getBatchStatus(batch: BatchSummary): BatchStatus {
  const counts = batch.file_counts;
  const total = batch.file_count;
  const waiting = countOf(counts, "UPLOADED") + countOf(counts, "QUEUED");
  const failed = countOf(counts, "FAILED");

  if (total > 0 && waiting === total) return "QUEUED";
  if (countOf(counts, "PROCESSING") > 0 || waiting > 0) return "PROCESSING";
  if (total > 0 && failed === total) return "FAILED";
  if (failed > 0) return "COMPLETED_WITH_ERRORS";
  return "COMPLETED";
}

function isActiveStatus(status: BatchStatus): boolean {
  return status === "QUEUED" || status === "PROCESSING";
}

// ── Filters ───────────────────────────────────────────────────

type BatchFilter = "all" | "active" | "attention" | "completed";

const FILTERS: Array<{ id: BatchFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "attention", label: "Needs attention" },
  { id: "completed", label: "Completed" },
];

const FILTER_MATCH: Record<BatchFilter, (status: BatchStatus) => boolean> = {
  all: () => true,
  active: isActiveStatus,
  attention: (s) => s === "FAILED" || s === "COMPLETED_WITH_ERRORS",
  completed: (s) => s === "COMPLETED",
};

// ── Formatting ────────────────────────────────────────────────

function formatRowCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - Date.parse(iso)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—";
  const end = endIso ? Date.parse(endIso) : Date.now();
  const seconds = Math.max(0, Math.round((end - Date.parse(startIso)) / 1000));
  let text: string;
  if (seconds < 60) text = `${seconds}s`;
  else if (seconds < 3600) text = `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  else text = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return endIso ? text : `${text} so far`;
}

// ── Small pieces ──────────────────────────────────────────────

function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const config = BATCH_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

const SEGMENT_ORDER: UploadStatus[] = [
  "PARSED",
  "PROCESSING",
  "FAILED",
  "QUEUED",
  "UPLOADED",
];

function SegmentedProgress({ counts }: { counts: BatchFileCounts }) {
  const segments = SEGMENT_ORDER.map((status) => ({
    status,
    count: countOf(counts, status),
  })).filter((s) => s.count > 0);

  const summary = segments
    .map((s) => `${s.count} ${STATUS_CONFIG[s.status].label.toLowerCase()}`)
    .join(" · ");

  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span
        role="img"
        aria-label={summary || "No files"}
        className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
      >
        {segments.map((s) => (
          <span
            key={s.status}
            className={`block basis-0 transition-[flex-grow] duration-500 ${STATUS_CONFIG[s.status].progressClass}`}
            style={{ flexGrow: s.count }}
          />
        ))}
      </span>
      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
        {summary || "No files"}
      </span>
    </span>
  );
}

function DetailRow({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 py-1.5">
      <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd
        className={`min-w-0 flex-1 break-words text-zinc-800 dark:text-zinc-200 ${mono ? "font-mono text-xs leading-5" : ""}`}
      >
        {children}
      </dd>
    </div>
  );
}

function PagBtn({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded transition-colors duration-150 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {children}
    </button>
  );
}

// ── Expanded panel: actions ───────────────────────────────────

function DeleteBatchButton({
  batch,
  onDeleted,
}: {
  batch: BatchDetail;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => deleteBatch(batch.batch_id),
    onSuccess: () => {
      setOpen(false);
      queryClient.setQueryData<BatchListResponse>(["batches"], (old) =>
        old
          ? {
              batches: old.batches.filter((b) => b.batch_id !== batch.batch_id),
              total: Math.max(0, old.total - 1),
            }
          : old,
      );
      queryClient.removeQueries({ queryKey: ["batch", batch.batch_id] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast(`Deleted ${batch.batch_id}`, "success");
      onDeleted();
    },
    onError: (err) => {
      if (import.meta.env.DEV) console.error("Delete batch failed:", err);
      toast(err instanceof Error ? err.message : "Failed to delete batch", "error");
    },
  });

  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <Button variant="danger" className="w-full justify-start">
          <Trash2 size={14} />
          Delete batch
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-6 shadow-xl border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900">
          <AlertDialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Delete {batch.batch_id}?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            This removes the batch and its {batch.file_count} file
            {batch.file_count !== 1 ? "s" : ""}. This can't be undone.
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                disabled={mutation.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  mutation.mutate();
                }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
              >
                {mutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function BatchActions({
  batch,
  onDeleted,
}: {
  batch: BatchDetail;
  onDeleted: () => void;
}) {
  return (
    <aside aria-label="Batch actions" className="flex w-full flex-col gap-2 sm:w-40 sm:shrink-0">
      <h3 className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Actions</h3>
      {/* Further batch actions (re-ingest, rename, export) go in this column. */}
      <DeleteBatchButton batch={batch} onDeleted={onDeleted} />
    </aside>
  );
}

// ── Expanded panel: details ───────────────────────────────────

function BatchDetails({ batch }: { batch: BatchDetail }) {
  const failed = countOf(batch.file_counts, "FAILED");

  return (
    <section
      aria-label="Batch details"
      className="min-w-0 flex-[1_1_18rem] rounded-lg border px-4 py-3 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Details</h3>
      <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800/60">
        <DetailRow label="Title">{batch.title ?? "—"}</DetailRow>
        <DetailRow label="Owner">{batch.owner ?? "—"}</DetailRow>
        <DetailRow label="Batch ID" mono>{batch.batch_id}</DetailRow>
        <DetailRow label="Ingest type" mono>{batch.ingest_type}</DetailRow>
        <DetailRow label="Source">{batch.source ?? "—"}</DetailRow>
        <DetailRow label="Parser" mono>{batch.parser ?? "—"}</DetailRow>
        <DetailRow label="Created">{formatDateTime(batch.created_at)}</DetailRow>
        <DetailRow label="Started">{formatDateTime(batch.started_at)}</DetailRow>
        <DetailRow label="Finished">{formatDateTime(batch.finished_at)}</DetailRow>
        <DetailRow label="Duration">
          {formatDuration(batch.started_at, batch.finished_at)}
        </DetailRow>
        <DetailRow label="Files">
          {batch.file_count}
          {failed > 0 && (
            <span className="text-red-600 dark:text-red-400"> · {failed} failed</span>
          )}
        </DetailRow>
        <DetailRow label="Total size">{formatFileSize(batch.total_bytes)}</DetailRow>
        <DetailRow label="Rows written">
          {batch.rows_written === null ? "—" : formatRowCount(batch.rows_written)}
        </DetailRow>
        <DetailRow label="Tables" mono>
          {batch.tables.length === 0 ? (
            "—"
          ) : (
            <span className="flex flex-wrap gap-x-3 gap-y-1">
              {batch.tables.map((table) => (
                <Link
                  key={table}
                  to={`/data/${batch.ingest_type}/${table}`}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {table}
                </Link>
              ))}
            </span>
          )}
        </DetailRow>
      </dl>
    </section>
  );
}

// ── Expanded panel: files ─────────────────────────────────────

function FileRow({
  file,
  ingestType,
  isOpen,
  onToggle,
}: {
  file: BatchFile;
  ingestType: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors duration-150 ${
          isOpen ? "bg-zinc-50 dark:bg-zinc-800/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        }`}
      >
        <ChevronRight
          size={14}
          className={`shrink-0 text-zinc-400 transition-transform duration-150 dark:text-zinc-500 ${isOpen ? "rotate-90" : ""}`}
        />
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-sm ${STATUS_CONFIG[file.status].progressClass}`}
        />
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-700 dark:text-zinc-300"
          title={file.filename}
        >
          {file.filename}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
          {formatFileSize(file.size_bytes)}
        </span>
        <StatusBadge status={file.status} />
      </button>

      {isOpen && (
        <div className="flex flex-col gap-2 bg-zinc-50 py-2 pl-11 pr-4 text-xs dark:bg-zinc-800/40">
          <dl className="flex flex-col">
            <DetailRow label="Job ID" mono>{file.job_id}</DetailRow>
            {file.status === "PROCESSING" && file.progress !== null && (
              <DetailRow label="Progress">{file.progress}%</DetailRow>
            )}
            {file.rows_written !== null && (
              <DetailRow label="Rows written">{formatRowCount(file.rows_written)}</DetailRow>
            )}
            <DetailRow label="Started">{formatDateTime(file.started_at)}</DetailRow>
            <DetailRow label="Duration">
              {formatDuration(file.started_at, file.finished_at)}
            </DetailRow>
          </dl>
          {file.error && (
            <p className="rounded-md border px-2.5 py-2 font-mono border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              {file.error}
            </p>
          )}
          {file.status === "PARSED" && (
            <Link
              to={`/data/${ingestType}`}
              className="self-start font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Open in Data
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function BatchFiles({ batch }: { batch: BatchDetail }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const failed = countOf(batch.file_counts, "FAILED");

  const toggle = (jobId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

  return (
    <section
      aria-label="Files in batch"
      className="min-w-0 flex-[1.4_1_22rem] overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5 border-zinc-100 dark:border-zinc-800/60">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Files</h3>
        <span className="rounded px-1.5 text-xs font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          {batch.file_count}
        </span>
        {failed > 0 && (
          <span className="ml-auto text-xs font-medium text-red-600 dark:text-red-400">
            {failed} failed
          </span>
        )}
      </div>
      <ul className="max-h-80 divide-y overflow-y-auto divide-zinc-100 dark:divide-zinc-800/60">
        {batch.files.map((file) => (
          <FileRow
            key={file.job_id}
            file={file}
            ingestType={batch.ingest_type}
            isOpen={expanded.has(file.job_id)}
            onToggle={() => toggle(file.job_id)}
          />
        ))}
      </ul>
    </section>
  );
}

// ── Expanded panel ────────────────────────────────────────────

function BatchPanel({
  id,
  batchId,
  onDeleted,
}: {
  id: string;
  batchId: string;
  onDeleted: () => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["batch", batchId],
    queryFn: ({ signal }) => getBatch(batchId, signal),
    refetchInterval: (query) =>
      query.state.data && isActiveStatus(getBatchStatus(query.state.data))
        ? POLL_INTERVAL_MS
        : false,
  });

  return (
    <div
      id={id}
      className="border-t px-5 pb-5 pt-4 md:pl-14 border-zinc-100 bg-zinc-50 dark:border-zinc-800/60 dark:bg-zinc-950/40"
    >
      {isLoading && (
        <div className="flex flex-wrap gap-4">
          <div className="h-24 w-full animate-pulse rounded-lg bg-zinc-200 sm:w-40 dark:bg-zinc-800" />
          <div className="h-64 flex-[1_1_18rem] animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-64 flex-[1.4_1_22rem] animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-3 py-6 text-sm text-red-500 dark:text-red-400">
          Failed to load this batch.
          <Button size="sm" onClick={() => void refetch()}>
            <RefreshCw size={12} />
            Retry
          </Button>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap items-start gap-4">
          <BatchActions batch={data} onDeleted={onDeleted} />
          <BatchDetails batch={data} />
          <BatchFiles batch={data} />
        </div>
      )}
    </div>
  );
}

// ── Batch row ─────────────────────────────────────────────────

function BatchRow({
  batch,
  status,
  isOpen,
  onToggle,
  onDeleted,
}: {
  batch: BatchSummary;
  status: BatchStatus;
  isOpen: boolean;
  onToggle: () => void;
  onDeleted: () => void;
}) {
  const panelId = `batch-panel-${batch.batch_id}`;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className={`flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 text-left transition-colors duration-150 ${ROW_COLUMNS} ${
          isOpen ? "bg-zinc-50 dark:bg-zinc-800/40" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30"
        }`}
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-zinc-400 transition-transform duration-150 dark:text-zinc-500 ${isOpen ? "rotate-90" : ""}`}
        />
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {batch.batch_id}
          </span>
          <span className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            {batch.ingest_type}
          </span>
        </span>
        <span className="hidden min-w-0 truncate md:block text-sm text-zinc-700 dark:text-zinc-300">
          {batch.title ?? <span className="text-zinc-400 dark:text-zinc-600">—</span>}
        </span>
        <span className="hidden min-w-0 truncate md:block text-sm text-zinc-500 dark:text-zinc-400">
          {batch.owner ?? "—"}
        </span>
        <span className="w-full min-w-0 md:w-auto">
          <SegmentedProgress counts={batch.file_counts} />
        </span>
        <span>
          <BatchStatusBadge status={status} />
        </span>
        <span className="text-sm tabular-nums text-zinc-600 md:text-right dark:text-zinc-400">
          {batch.file_count}
          <span className="md:hidden"> files</span>
        </span>
        <span
          className="text-xs text-zinc-500 md:text-right dark:text-zinc-400"
          title={formatDateTime(batch.created_at)}
        >
          {formatRelativeTime(batch.created_at)}
        </span>
      </button>

      {isOpen && <BatchPanel id={panelId} batchId={batch.batch_id} onDeleted={onDeleted} />}
    </li>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function BatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get("open");
  const [filter, setFilter] = useState<BatchFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["batches"],
    queryFn: ({ signal }) => listBatches(signal),
    refetchInterval: (query) =>
      query.state.data?.batches.some((b) => isActiveStatus(getBatchStatus(b)))
        ? POLL_INTERVAL_MS
        : false,
  });

  const rows = (data?.batches ?? []).map((batch) => ({
    batch,
    status: getBatchStatus(batch),
  }));
  const visible = rows.filter((r) => FILTER_MATCH[filter](r.status));

  const searched = search.trim()
    ? visible.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.batch.batch_id.toLowerCase().includes(q) ||
          (r.batch.title?.toLowerCase().includes(q) ?? false) ||
          (r.batch.owner?.toLowerCase().includes(q) ?? false) ||
          r.batch.ingest_type.toLowerCase().includes(q)
        );
      })
    : visible;

  const totalPages = Math.max(1, Math.ceil(searched.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = searched.slice((safePage - 1) * pageSize, safePage * pageSize);

  // The open batch lives in the URL (?open=<id>) so it can be linked to.
  const setOpenBatch = (batchId: string | null) =>
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (batchId) next.set("open", batchId);
        else next.delete("open");
        return next;
      },
      { replace: true },
    );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Batches</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Everything you&apos;ve uploaded, grouped by batch.
          </p>
        </div>
        <Link
          to="/ingest"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-500 active:bg-blue-700"
        >
          <Upload size={14} />
          Upload batch
        </Link>
      </div>

      <div role="group" aria-label="Filter batches" className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const selected = filter === f.id;
          const count = rows.filter((r) => FILTER_MATCH[f.id](r.status)).length;
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={selected}
              onClick={() => { setFilter(f.id); setPage(1); }}
              className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors duration-150 ${
                selected
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              {f.label}
              <span
                className={`min-w-5 rounded-full px-1.5 text-center tabular-nums ${
                  selected
                    ? "bg-white/20 dark:bg-zinc-900/20"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {isLoading ? "–" : count}
              </span>
            </button>
          );
        })}
        <div className="relative ml-auto">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
          />
          <input
            type="search"
            placeholder="Search batches…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="h-8 w-52 rounded-full border bg-white pl-8 pr-3 text-xs text-zinc-700 placeholder-zinc-400 transition-colors duration-150 border-zinc-200 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300 dark:placeholder-zinc-500 dark:focus:border-zinc-600"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
        <div
          aria-hidden="true"
          className={`hidden items-center gap-x-4 border-b px-5 py-2.5 text-xs font-medium border-zinc-100 bg-zinc-50 text-zinc-500 dark:border-zinc-800/60 dark:bg-zinc-900 dark:text-zinc-400 ${ROW_COLUMNS}`}
        >
          <span />
          <span>Batch</span>
          <span>Title</span>
          <span>Owner</span>
          <span>Progress</span>
          <span>Status</span>
          <span className="text-right">Files</span>
          <span className="text-right">Created</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-2 flex-1 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-4 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center gap-3 py-16 text-sm text-red-500 dark:text-red-400">
            Failed to load batches.
            <Button size="sm" onClick={() => void refetch()}>
              <RefreshCw size={12} />
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No batches yet.{" "}
            <Link to="/ingest" className="text-blue-600 hover:underline dark:text-blue-400">
              Upload files on the Ingest page.
            </Link>
          </p>
        )}

        {!isLoading && !isError && rows.length > 0 && visible.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No batches match this filter.
          </p>
        )}

        {!isLoading && !isError && visible.length > 0 && searched.length === 0 && (
          <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-500">
            No batches match your search.
          </p>
        )}

        {paged.length > 0 && (
          <>
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {paged.map(({ batch, status }) => (
                <BatchRow
                  key={batch.batch_id}
                  batch={batch}
                  status={status}
                  isOpen={openId === batch.batch_id}
                  onToggle={() =>
                    setOpenBatch(openId === batch.batch_id ? null : batch.batch_id)
                  }
                  onDeleted={() => setOpenBatch(null)}
                />
              ))}
            </ul>
            {searched.length > pageSize && (
              <div className="flex items-center justify-between border-t px-5 py-3 border-zinc-100 dark:border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">Per page</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="h-7 rounded border px-1.5 text-xs border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    {PAGE_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="mr-2 font-mono text-xs text-zinc-400 dark:text-zinc-500">
                    {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, searched.length)} of {searched.length}
                  </span>
                  <PagBtn onClick={() => setPage(1)} disabled={safePage <= 1}>
                    <ChevronsLeft size={14} />
                  </PagBtn>
                  <PagBtn onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>
                    <ChevronLeft size={14} />
                  </PagBtn>
                  <PagBtn onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages}>
                    <ChevronRight size={14} />
                  </PagBtn>
                  <PagBtn onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>
                    <ChevronsRight size={14} />
                  </PagBtn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
