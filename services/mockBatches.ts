import { ApiError } from "./api";
import type { UploadStatus } from "@/constants/apiTypes";
import type {
  BatchDetail,
  BatchFile,
  BatchFileCounts,
  BatchListResponse,
  BatchSummary,
} from "./batches";

// In-memory batches for VITE_MOCK=true. Active batches advance a step
// every few seconds so the page's polling has something to show.

const MINUTE = 60_000;
const MB = 1024 * 1024;
const TICK_MS = 2_500;
const MAX_CONCURRENT_FILES = 2;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iso(ms: number | null): string | null {
  return ms === null ? null : new Date(ms).toISOString();
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

// ── Seed data ─────────────────────────────────────────────────

interface SeedBatch {
  id: string;
  type: string;
  minutesAgo: number;
  /** Minutes from start to finish; omit for batches still running */
  durationMin?: number;
  source: string;
  parser: string;
  tables: string[];
  fileName: (index: number) => string;
  baseBytes: number;
  /** One letter per file: P parsed, R processing, Q queued, F failed */
  statuses: string;
  errors?: Record<number, string>;
  allFilesError?: string;
}

const STATUS_CODES: Record<string, UploadStatus> = {
  P: "PARSED",
  R: "PROCESSING",
  Q: "QUEUED",
  F: "FAILED",
};

const SEEDS: SeedBatch[] = [
  {
    id: "batch-0419",
    type: "netflow",
    minutesAgo: 1,
    source: "Web upload",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    fileName: (i) => `flows_part-${pad(i, 4)}.parquet`,
    baseBytes: 380 * MB,
    statuses: "QQQQ",
  },
  {
    id: "batch-0418",
    type: "pcap",
    minutesAgo: 4,
    source: "Web upload",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "dns_queries", "http_requests"],
    fileName: (i) => `dc-east-${pad(i)}.pcap`,
    baseBytes: 140 * MB,
    statuses: "PPPPPPPPPPPPRRQ",
  },
  {
    id: "batch-0417",
    type: "pcap",
    minutesAgo: 63,
    durationMin: 21,
    source: "API key · ci-nightly",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "dns_queries", "http_requests"],
    fileName: (i) => `edge-${pad(i)}.pcap`,
    baseBytes: 160 * MB,
    statuses: "PPFPPPPPFPPPP",
    errors: {
      2: "Truncated packet at offset 0x3F2A10. The capture ends mid-frame.",
      8: "Unsupported link-layer type (DLT 228).",
    },
  },
  {
    id: "batch-0416",
    type: "project_b",
    minutesAgo: 190,
    durationMin: 3,
    source: "Web upload",
    parser: "csv-loader 1.9.0",
    tables: ["events", "metrics"],
    fileName: (i) => `events_${pad(i)}.csv`,
    baseBytes: 24 * MB,
    statuses: "PPPPPPPP",
  },
  {
    id: "batch-0415",
    type: "project_b",
    minutesAgo: 1_000,
    durationMin: 1,
    source: "API key · siem-export",
    parser: "json-loader 1.2.0",
    tables: [],
    fileName: (i) => `alerts_${pad(i)}.json`,
    baseBytes: 12 * MB,
    statuses: "FFFFFF",
    allFilesError: 'Schema mismatch: field "ts" expected timestamp, got string.',
  },
];

// ── Store ─────────────────────────────────────────────────────

function countFiles(files: BatchFile[]): BatchFileCounts {
  const counts: BatchFileCounts = {};
  for (const f of files) counts[f.status] = (counts[f.status] ?? 0) + 1;
  return counts;
}

function isActiveFile(f: BatchFile): boolean {
  return f.status === "UPLOADED" || f.status === "QUEUED" || f.status === "PROCESSING";
}

/** Recompute the batch-level fields that derive from its files. */
function finalize(batch: BatchDetail, now: number): void {
  batch.file_count = batch.files.length;
  batch.total_bytes = batch.files.reduce((sum, f) => sum + f.size_bytes, 0);
  batch.file_counts = countFiles(batch.files);
  batch.rows_written = batch.started_at
    ? batch.files.reduce((sum, f) => sum + (f.rows_written ?? 0), 0)
    : null;

  if (batch.files.some(isActiveFile)) {
    batch.finished_at = null;
  } else if (!batch.finished_at) {
    batch.finished_at = iso(now);
  }
}

function buildBatch(seed: SeedBatch, now: number): BatchDetail {
  const created = now - seed.minutesAgo * MINUTE;
  const codes = seed.statuses.split("");
  const started = codes.some((c) => c !== "Q") ? created + 20_000 : null;
  const finished =
    seed.durationMin !== undefined && started !== null
      ? started + seed.durationMin * MINUTE
      : null;

  const files: BatchFile[] = codes.map((code, i) => {
    const status = STATUS_CODES[code] ?? "QUEUED";
    const size = Math.round(seed.baseBytes * (1 + ((i * 37) % 23) / 20));
    const fileStart = started !== null && status !== "QUEUED" ? started + i * 30_000 : null;
    const done = status === "PARSED" || status === "FAILED";
    const fileEnd = done && fileStart !== null ? fileStart + Math.max(5_000, size / 20_000) : null;

    let rows: number | null = null;
    if (status === "PARSED") rows = Math.round(size / 180);
    if (status === "PROCESSING") rows = Math.round(size / 400);

    return {
      job_id: `job_${seed.id.slice(-4)}_${pad(i + 1, 3)}`,
      filename: seed.fileName(i + 1),
      size_bytes: size,
      status,
      progress: status === "PROCESSING" ? (i % 2 ? 35 : 70) : null,
      rows_written: rows,
      error:
        status === "FAILED"
          ? (seed.allFilesError ?? seed.errors?.[i] ?? "Parser exited with an error.")
          : null,
      started_at: iso(fileStart),
      finished_at: iso(fileEnd),
    };
  });

  const batch: BatchDetail = {
    batch_id: seed.id,
    ingest_type: seed.type,
    created_at: new Date(created).toISOString(),
    started_at: iso(started),
    finished_at: iso(finished),
    file_count: 0,
    total_bytes: 0,
    file_counts: {},
    source: seed.source,
    parser: seed.parser,
    rows_written: null,
    tables: seed.tables,
    files,
  };
  finalize(batch, now);
  return batch;
}

let store: BatchDetail[] = SEEDS.map((seed) => buildBatch(seed, Date.now()));
let lastTick = Date.now();

/** Advance processing files and start queued ones, at most once per TICK_MS. */
function tick(): void {
  const now = Date.now();
  if (now - lastTick < TICK_MS) return;
  lastTick = now;

  for (const batch of store) {
    if (!batch.files.some(isActiveFile)) continue;

    for (const file of batch.files) {
      if (file.status !== "PROCESSING") continue;
      const progress = Math.min(100, (file.progress ?? 0) + 30);
      const fullRows = Math.round(file.size_bytes / 180);
      if (progress >= 100) {
        file.status = "PARSED";
        file.progress = null;
        file.rows_written = fullRows;
        file.finished_at = iso(now);
      } else {
        file.progress = progress;
        file.rows_written = Math.round((fullRows * progress) / 100);
      }
    }

    let slots =
      MAX_CONCURRENT_FILES - batch.files.filter((f) => f.status === "PROCESSING").length;
    for (const file of batch.files) {
      if (slots <= 0) break;
      if (file.status !== "QUEUED" && file.status !== "UPLOADED") continue;
      file.status = "PROCESSING";
      file.progress = 5;
      file.rows_written = 0;
      file.started_at = iso(now);
      slots--;
    }

    if (!batch.started_at) batch.started_at = iso(now);
    finalize(batch, now);
  }
}

function toSummary(batch: BatchDetail): BatchSummary {
  return {
    batch_id: batch.batch_id,
    ingest_type: batch.ingest_type,
    created_at: batch.created_at,
    started_at: batch.started_at,
    finished_at: batch.finished_at,
    file_count: batch.file_count,
    total_bytes: batch.total_bytes,
    file_counts: { ...batch.file_counts },
  };
}

function notFound(batchId: string): ApiError {
  return new ApiError({
    code: "SERVER_ERROR",
    status: 404,
    message: `Batch ${batchId} not found`,
  });
}

// ── Mock API ──────────────────────────────────────────────────

export async function mockListBatches(): Promise<BatchListResponse> {
  await delay(300);
  tick();
  return { batches: store.map(toSummary), total: store.length };
}

export async function mockGetBatch(batchId: string): Promise<BatchDetail> {
  await delay(250);
  tick();
  const batch = store.find((b) => b.batch_id === batchId);
  if (!batch) throw notFound(batchId);
  return structuredClone(batch);
}

export async function mockDeleteBatch(batchId: string): Promise<void> {
  await delay(400);
  if (!store.some((b) => b.batch_id === batchId)) throw notFound(batchId);
  store = store.filter((b) => b.batch_id !== batchId);
}
