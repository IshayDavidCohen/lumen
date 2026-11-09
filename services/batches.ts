import { apiDelete, apiGet } from "./api";
import { mockDeleteBatch, mockGetBatch, mockListBatches } from "./mockBatches";
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
  /** Column/value that selects this batch's rows; defaults to batch_id = <batch_id> */
  filter?: { column: string; value: string | number };
}

/** One parser fed by the batch's files, and the analyses fed by that parser's output. */
export interface PipelineBranch {
  parser: PipelineStep;
  analyses: PipelineStep[];
}

export interface BatchDetail extends BatchSummary {
  /** Where the batch came from, e.g. "Web upload" or an API key name */
  source: string | null;
  parser: string | null;
  rows_written: number | null;
  tables: string[];
  files: BatchFile[];
  /** The pipeline submitted with this batch */
  pipeline: PipelineBranch[];
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

/** SQL selecting a table's rows from one batch, optionally narrowed to one iteration. */
export function batchRowsSql(table: string, batchId: string, iteration?: number): string {
  return rowsWhereSql(table, {
    batch_id: batchId,
    ...(iteration !== undefined && { iteration }),
  });
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
