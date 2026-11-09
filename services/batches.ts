import { apiDelete, apiGet, apiPatch, apiPost } from "./api";
import {
  mockAddBatchNote,
  mockCancelBatch,
  mockDeleteBatch,
  mockDeleteBatchNote,
  mockGetBatch,
  mockListBatches,
  mockListBatchNotes,
  mockRetryFailedFiles,
  mockUpdateBatchNote,
  mockUpdateBatchTitle,
} from "./mockBatches";
import type { UploadStatus } from "@/constants/apiTypes";
import type { BatchFilter } from "./batchStatus";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

// ── Types ─────────────────────────────────────────────────────

/** Number of files in each status. A missing key means zero. */
export type BatchFileCounts = Partial<Record<UploadStatus, number>>;

export interface BatchSummary {
  batch_id: string;
  ingest_type: string;
  title: string | null;
  owner: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  file_count: number;
  total_bytes: number;
  file_counts: BatchFileCounts;
}

export interface BatchFile {
  job_id: string;
  filename: string;
  /** Zero-based iteration within the batch; a batch is a sequence of iterations, each a set of files */
  iteration: number;
  size_bytes: number;
  status: UploadStatus;
  /** 0–100 while PROCESSING, otherwise null */
  progress: number | null;
  rows_written: number | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export type PipelineStepStatus = "QUEUED" | "PROCESSING" | "FINISHED" | "FAILED";

export interface PipelineStep {
  name: string;
  status: PipelineStepStatus;
  /** Table the step writes to; defaults to `name` */
  table?: string;
  /** Column that selects this batch's rows in `table`; defaults to run_id */
  filter_by?: "run_id" | "batch_id";
}

/** One parser fed by the batch's files, and the analyses fed by that parser's output. */
export interface PipelineBranch {
  parser: PipelineStep;
  analyses: PipelineStep[];
}

export interface BatchDetail extends BatchSummary {
  /** The pipeline run that processed this batch; pipeline tables are filtered by it by default */
  run_id: string;
  /** Where the batch came from, e.g. "Web upload" or an API key name */
  source: string | null;
  parser: string | null;
  rows_written: number | null;
  tables: string[];
  files: BatchFile[];
  /** The pipeline submitted with this batch */
  pipeline: PipelineBranch[];
  note_count: number;
}

export interface BatchNote {
  id: string;
  batch_id: string;
  author: string;
  body: string;
  created_at: string;
  /** null until the note is edited */
  updated_at: string | null;
}

export interface NewBatchNote {
  /** Typed by the user for now; once users exist the backend can take it from the session */
  author: string;
  body: string;
}

export interface BatchListResponse {
  batches: BatchSummary[];
  total: number;
  /** Batches per filter tab, ignoring `q` and pagination */
  counts: Record<BatchFilter, number>;
  /** Whether any of the user's batches is still running (drives polling) */
  has_active: boolean;
}

// ── Data links ────────────────────────────────────────────────

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** SQL selecting a table's rows where every column equals its value. */
export function rowsWhereSql(table: string, where: Record<string, string | number>): string {
  const conditions = Object.entries(where).map(
    ([column, value]) => `${column} = ${typeof value === "number" ? value : sqlString(value)}`,
  );
  return `SELECT * FROM ${table} WHERE ${conditions.join(" AND ")};`;
}

/** The table a pipeline step writes to, and the column/value that selects this batch's rows in it. */
export function stepTarget(step: PipelineStep, batch: Pick<BatchDetail, "batch_id" | "run_id">) {
  const column = step.filter_by ?? "run_id";
  return {
    table: step.table ?? step.name,
    filter: { column, value: batch[column] },
  };
}

/** Data page URL that opens `table` and runs `sql` against it on arrival. */
export function dataQueryPath(ingestType: string, table: string, sql: string): string {
  return `/data/${ingestType}/${table}?${new URLSearchParams({ sql })}`;
}

// ── Service API ───────────────────────────────────────────────

export interface ListBatchesParams {
  /** 1-based; omit page/pageSize to get every matching batch */
  page?: number;
  pageSize?: number;
  filter?: BatchFilter;
  /** Case-insensitive match on batch ID, title, owner and ingest type */
  q?: string;
  signal?: AbortSignal;
}

/**
 * Batches owned by the current user, newest first. The backend scopes this to
 * the caller. `total` counts every batch matching `filter` and `q`.
 */
export async function listBatches(
  params: ListBatchesParams = {},
): Promise<BatchListResponse> {
  if (USE_MOCK) return mockListBatches(params);

  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.filter && params.filter !== "all") searchParams.set("filter", params.filter);
  if (params.q?.trim()) searchParams.set("q", params.q.trim());

  const query = searchParams.toString();
  return apiGet<BatchListResponse>(`/batches${query ? `?${query}` : ""}`, params.signal);
}

export async function getBatch(
  batchId: string,
  signal?: AbortSignal,
): Promise<BatchDetail> {
  if (USE_MOCK) return mockGetBatch(batchId);
  return apiGet<BatchDetail>(`/batches/${encodeURIComponent(batchId)}`, signal);
}

export async function deleteBatch(batchId: string): Promise<void> {
  if (USE_MOCK) return mockDeleteBatch(batchId);
  return apiDelete(`/batches/${encodeURIComponent(batchId)}`);
}

/** Stop a queued or running batch. */
export async function cancelBatch(batchId: string): Promise<void> {
  if (USE_MOCK) return mockCancelBatch(batchId);
  return apiPost(`/batches/${encodeURIComponent(batchId)}/cancel`, {});
}

/** Send the batch's failed files back through the pipeline. */
export async function retryFailedFiles(batchId: string): Promise<void> {
  if (USE_MOCK) return mockRetryFailedFiles(batchId);
  return apiPost(`/batches/${encodeURIComponent(batchId)}/retry`, {});
}

export async function updateBatchTitle(batchId: string, title: string | null): Promise<void> {
  if (USE_MOCK) return mockUpdateBatchTitle(batchId, title);
  return apiPatch(`/batches/${encodeURIComponent(batchId)}`, { title });
}

// ── Notes ─────────────────────────────────────────────────────

function notesPath(batchId: string, noteId?: string): string {
  const base = `/batches/${encodeURIComponent(batchId)}/notes`;
  return noteId ? `${base}/${encodeURIComponent(noteId)}` : base;
}

/** A batch's notes, oldest first. */
export async function listBatchNotes(batchId: string, signal?: AbortSignal): Promise<BatchNote[]> {
  if (USE_MOCK) return mockListBatchNotes(batchId);
  return apiGet<BatchNote[]>(notesPath(batchId), signal);
}

export async function addBatchNote(batchId: string, note: NewBatchNote): Promise<BatchNote> {
  if (USE_MOCK) return mockAddBatchNote(batchId, note);
  return apiPost<BatchNote>(notesPath(batchId), note);
}

export async function updateBatchNote(
  batchId: string,
  noteId: string,
  body: string,
): Promise<BatchNote> {
  if (USE_MOCK) return mockUpdateBatchNote(batchId, noteId, body);
  return apiPatch<BatchNote>(notesPath(batchId, noteId), { body });
}

export async function deleteBatchNote(batchId: string, noteId: string): Promise<void> {
  if (USE_MOCK) return mockDeleteBatchNote(batchId, noteId);
  return apiDelete(notesPath(batchId, noteId));
}
