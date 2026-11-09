import type { UploadStatus } from "@/constants/apiTypes";
import type { BatchFileCounts, BatchSummary } from "./batches";

// Batch status and filter rules, shared by the Batches page and the mock API.
// The real backend applies the same rules when filtering /batches.

export type BatchStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";

export type BatchFilter = "all" | "active" | "attention" | "completed";

export function countOf(counts: BatchFileCounts, status: UploadStatus): number {
  return counts[status] ?? 0;
}

export function getBatchStatus(batch: BatchSummary): BatchStatus {
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

export function isActiveStatus(status: BatchStatus): boolean {
  return status === "QUEUED" || status === "PROCESSING";
}

export const FILTER_MATCH: Record<BatchFilter, (status: BatchStatus) => boolean> = {
  all: () => true,
  active: isActiveStatus,
  attention: (s) => s === "FAILED" || s === "COMPLETED_WITH_ERRORS",
  completed: (s) => s === "COMPLETED",
};
