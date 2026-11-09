import { apiDelete, apiGet } from "./api";
import { mockDeleteBatch, mockGetBatch, mockListBatches } from "./mockBatches";
import type { UploadStatus } from "@/constants/apiTypes";

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

export interface BatchDetail extends BatchSummary {
  /** Where the batch came from, e.g. "Web upload" or an API key name */
  source: string | null;
  parser: string | null;
  rows_written: number | null;
  tables: string[];
  files: BatchFile[];
}

export interface BatchListResponse {
  batches: BatchSummary[];
  total: number;
}

// ── Data links ────────────────────────────────────────────────

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** SQL selecting a table's rows from one batch, optionally narrowed to one iteration. */
export function batchRowsSql(table: string, batchId: string, iteration?: number): string {
  const where = [`batch_id = ${sqlString(batchId)}`];
  if (iteration !== undefined) where.push(`iteration = ${iteration}`);
  return `SELECT * FROM ${table} WHERE ${where.join(" AND ")};`;
}

/** Data page URL that opens `table` and runs `sql` against it on arrival. */
export function dataQueryPath(ingestType: string, table: string, sql: string): string {
  return `/data/${ingestType}/${table}?${new URLSearchParams({ sql })}`;
}

// ── Service API ───────────────────────────────────────────────

/** Batches owned by the current user, newest first. The backend scopes this to the caller. */
export async function listBatches(
  signal?: AbortSignal,
): Promise<BatchListResponse> {
  if (USE_MOCK) return mockListBatches();
  return apiGet<BatchListResponse>("/batches", signal);
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
