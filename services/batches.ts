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
  /** Parse attempt this status belongs to; 1 is the first try, higher means retried */
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
