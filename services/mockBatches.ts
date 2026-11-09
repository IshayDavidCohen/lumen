import { ApiError } from "./api";
import type { UploadStatus } from "@/constants/apiTypes";
import type {
  BatchDetail,
  BatchFile,
  BatchFileCounts,
  BatchListResponse,
  BatchNote,
  BatchSummary,
  ListBatchesParams,
  NewBatchNote,
  PipelineBranch,
  PipelineStepStatus,
} from "./batches";
import {
  FILTER_MATCH,
  getBatchStatus,
  isActiveStatus,
  type BatchFilter,
} from "./batchStatus";

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

/** Mock batches group files into iterations of this size: 0,0,1,1,2,2,… */
const FILES_PER_ITERATION = 2;

interface SeedFile {
  filename: string;
  /** Zero-based iteration this file belongs to */
  iteration: number;
  error?: string;
  status: UploadStatus;
}

interface SeedBatch {
  id: string;
  type: string;
  title: string | null;
  owner: string | null;
  minutesAgo: number;
  /** Minutes from start to finish; omit for batches still running */
  durationMin?: number;
  source: string;
  parser: string;
  tables: string[];
  baseBytes: number;
  files: SeedFile[];
}

/** The first `count` files of a batch, all sharing one status (and error, if any). */
function sameFiles(
  count: number,
  name: (n: number) => string,
  status: UploadStatus = "PARSED",
  error?: string,
): SeedFile[] {
  return Array.from({ length: count }, (_, i) => ({
    filename: name(i + 1),
    iteration: Math.floor(i / FILES_PER_ITERATION),
    status,
    ...(error !== undefined && { error }),
  }));
}

const SEEDS: SeedBatch[] = [
  {
    id: "batch-0419",
    type: "netflow",
    title: "Nov sensor sweep",
    owner: "alice",
    minutesAgo: 1,
    source: "Web upload",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    baseBytes: 380 * MB,
    files: sameFiles(4, (n) => `flows_part-${pad(n, 4)}.parquet`, "QUEUED"),
  },
  {
    id: "batch-0418",
    type: "pcap",
    title: "DC East packet capture",
    owner: "bob",
    minutesAgo: 4,
    source: "Web upload",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "dns_queries", "http_requests"],
    baseBytes: 140 * MB,
    files: [
      ...sameFiles(12, (n) => `dc-east-${pad(n)}.pcap`),
      { filename: "dc-east-13.pcap", iteration: 6, status: "PROCESSING" },
      { filename: "dc-east-14.pcap", iteration: 6, status: "PROCESSING" },
      { filename: "dc-east-15.pcap", iteration: 7, status: "QUEUED" },
    ],
  },
  {
    id: "batch-0417",
    type: "pcap",
    title: "Edge nodes overnight",
    owner: "alice",
    minutesAgo: 63,
    durationMin: 21,
    source: "API key · ci-nightly",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "dns_queries", "http_requests"],
    baseBytes: 160 * MB,
    files: [
      { filename: "edge-01.pcap", iteration: 0, status: "PARSED" },
      { filename: "edge-02.pcap", iteration: 0, status: "PARSED" },
      {
        filename: "edge-03.pcap",
        iteration: 1,
        status: "FAILED",
        error: "Truncated packet at offset 0x3F2A10. The capture ends mid-frame.",
      },
      { filename: "edge-04.pcap", iteration: 1, status: "PARSED" },
      { filename: "edge-05.pcap", iteration: 2, status: "PARSED" },
      { filename: "edge-06.pcap", iteration: 2, status: "PARSED" },
      { filename: "edge-07.pcap", iteration: 3, status: "PARSED" },
      { filename: "edge-08.pcap", iteration: 3, status: "PARSED" },
      {
        filename: "edge-09.pcap",
        iteration: 4,
        status: "FAILED",
        error: "Unsupported link-layer type (DLT 228).",
      },
      { filename: "edge-10.pcap", iteration: 4, status: "PARSED" },
      { filename: "edge-11.pcap", iteration: 5, status: "PARSED" },
      { filename: "edge-12.pcap", iteration: 5, status: "PARSED" },
      { filename: "edge-13.pcap", iteration: 6, status: "PARSED" },
    ],
  },
  {
    id: "batch-0416",
    type: "project_b",
    title: "Project B events Q4",
    owner: "charlie",
    minutesAgo: 190,
    durationMin: 3,
    source: "Web upload",
    parser: "csv-loader 1.9.0",
    tables: ["events", "metrics"],
    baseBytes: 24 * MB,
    files: sameFiles(8, (n) => `events_${pad(n)}.csv`),
  },
  {
    id: "batch-0415",
    type: "project_b",
    title: null,
    owner: "bob",
    minutesAgo: 1_000,
    durationMin: 1,
    source: "API key · siem-export",
    parser: "json-loader 1.2.0",
    tables: [],
    baseBytes: 12 * MB,
    files: sameFiles(
      6,
      (n) => `alerts_${pad(n)}.json`,
      "FAILED",
      'Schema mismatch: field "ts" expected timestamp, got string.',
    ),
  },
  {
    id: "batch-0414",
    type: "netflow",
    title: "Core router export",
    owner: "diana",
    minutesAgo: 1_440,
    durationMin: 8,
    source: "Web upload",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    baseBytes: 510 * MB,
    files: sameFiles(12, (n) => `core-router-${pad(n, 4)}.parquet`),
  },
  {
    id: "batch-0413",
    type: "pcap",
    title: "Branch office sweep",
    owner: "charlie",
    minutesAgo: 2_100,
    durationMin: 14,
    source: "API key · ci-nightly",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections"],
    baseBytes: 95 * MB,
    files: [
      { filename: "branch-01.pcap", iteration: 0, status: "PARSED" },
      { filename: "branch-02.pcap", iteration: 0, status: "PARSED" },
      { filename: "branch-03.pcap", iteration: 1, status: "PARSED" },
      { filename: "branch-04.pcap", iteration: 1, status: "PARSED" },
      { filename: "branch-05.pcap", iteration: 2, status: "PARSED" },
      {
        filename: "branch-06.pcap",
        iteration: 2,
        status: "FAILED",
        error: "Corrupt frame at offset 0x1A0044.",
      },
      { filename: "branch-07.pcap", iteration: 3, status: "PARSED" },
      { filename: "branch-08.pcap", iteration: 3, status: "PARSED" },
      { filename: "branch-09.pcap", iteration: 4, status: "PARSED" },
    ],
  },
  {
    id: "batch-0412",
    type: "project_b",
    title: "Metrics backfill Oct",
    owner: "alice",
    minutesAgo: 2_880,
    durationMin: 5,
    source: "Web upload",
    parser: "csv-loader 1.9.0",
    tables: ["events", "metrics"],
    baseBytes: 31 * MB,
    files: sameFiles(12, (n) => `metrics_oct_${pad(n)}.csv`),
  },
  {
    id: "batch-0411",
    type: "netflow",
    title: "WAN telemetry",
    owner: "bob",
    minutesAgo: 4_320,
    durationMin: 11,
    source: "API key · siem-export",
    parser: "parquet-loader 1.4.0",
    tables: ["flows"],
    baseBytes: 220 * MB,
    files: sameFiles(8, (n) => `wan-${pad(n, 4)}.parquet`),
  },
  {
    id: "batch-0410",
    type: "pcap",
    title: "DMZ full capture",
    owner: "diana",
    minutesAgo: 5_760,
    durationMin: 30,
    source: "Web upload",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "dns_queries"],
    baseBytes: 480 * MB,
    files: sameFiles(16, (n) => `dmz-${pad(n)}.pcap`),
  },
  {
    id: "batch-0409",
    type: "project_b",
    title: "Alert correlation run",
    owner: "charlie",
    minutesAgo: 7_200,
    durationMin: 2,
    source: "API key · ci-nightly",
    parser: "json-loader 1.2.0",
    tables: ["events"],
    baseBytes: 8 * MB,
    files: sameFiles(4, (n) => `corr_${pad(n)}.json`),
  },
  {
    id: "batch-0408",
    type: "netflow",
    title: null,
    owner: "alice",
    minutesAgo: 8_640,
    durationMin: 7,
    source: "Web upload",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    baseBytes: 290 * MB,
    files: [
      ...sameFiles(7, (n) => `flows_${pad(n, 4)}.parquet`),
      {
        filename: "flows_0008.parquet",
        iteration: 3,
        status: "FAILED",
        error: "Unexpected EOF reading flow record.",
      },
      { filename: "flows_0009.parquet", iteration: 4, status: "PARSED" },
      { filename: "flows_0010.parquet", iteration: 4, status: "PARSED" },
    ],
  },
  {
    id: "batch-0407",
    type: "pcap",
    title: "Datacenter east spine",
    owner: "bob",
    minutesAgo: 10_080,
    durationMin: 18,
    source: "API key · siem-export",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "http_requests"],
    baseBytes: 320 * MB,
    files: sameFiles(12, (n) => `spine-${pad(n)}.pcap`),
  },
  {
    id: "batch-0406",
    type: "project_b",
    title: "Sep events archive",
    owner: "diana",
    minutesAgo: 12_960,
    durationMin: 4,
    source: "Web upload",
    parser: "csv-loader 1.9.0",
    tables: ["events", "metrics"],
    baseBytes: 19 * MB,
    files: sameFiles(8, (n) => `sep_events_${pad(n)}.csv`),
  },
  {
    id: "batch-0405",
    type: "netflow",
    title: "Peering point export",
    owner: "charlie",
    minutesAgo: 14_400,
    durationMin: 9,
    source: "API key · ci-nightly",
    parser: "parquet-loader 1.4.0",
    tables: ["flows"],
    baseBytes: 410 * MB,
    files: [
      ...sameFiles(6, (n) => `peering-${pad(n, 4)}.parquet`),
      {
        filename: "peering-0007.parquet",
        iteration: 3,
        status: "FAILED",
        error: "Checksum mismatch on row group 3.",
      },
      { filename: "peering-0008.parquet", iteration: 3, status: "PARSED" },
      { filename: "peering-0009.parquet", iteration: 4, status: "PARSED" },
      { filename: "peering-0010.parquet", iteration: 4, status: "PARSED" },
      { filename: "peering-0011.parquet", iteration: 5, status: "PARSED" },
    ],
  },
  {
    id: "batch-0404",
    type: "pcap",
    title: "Guest VLAN capture",
    owner: "alice",
    minutesAgo: 17_280,
    durationMin: 6,
    source: "Web upload",
    parser: "pcap-parser 2.3.1",
    tables: ["packets"],
    baseBytes: 55 * MB,
    files: sameFiles(
      6,
      (n) => `guest-vlan-${pad(n)}.pcap`,
      "FAILED",
      "Link-layer type DLT_NULL not supported.",
    ),
  },
  {
    id: "batch-0403",
    type: "project_b",
    title: "Threat intel feed",
    owner: "bob",
    minutesAgo: 20_160,
    durationMin: 3,
    source: "API key · siem-export",
    parser: "json-loader 1.2.0",
    tables: ["events"],
    baseBytes: 14 * MB,
    files: sameFiles(8, (n) => `ti_feed_${pad(n)}.json`),
  },
  {
    id: "batch-0402",
    type: "netflow",
    title: "Aggregated daily flows",
    owner: "diana",
    minutesAgo: 22_320,
    durationMin: 12,
    source: "Web upload",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    baseBytes: 650 * MB,
    files: sameFiles(16, (n) => `daily-${pad(n, 4)}.parquet`),
  },
  {
    id: "batch-0401",
    type: "pcap",
    title: "VPN gateway traffic",
    owner: "charlie",
    minutesAgo: 25_200,
    durationMin: 22,
    source: "API key · ci-nightly",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections"],
    baseBytes: 175 * MB,
    files: [
      { filename: "vpn-gw-01.pcap", iteration: 0, status: "PARSED" },
      { filename: "vpn-gw-02.pcap", iteration: 0, status: "PARSED" },
      { filename: "vpn-gw-03.pcap", iteration: 1, status: "PARSED" },
      {
        filename: "vpn-gw-04.pcap",
        iteration: 1,
        status: "FAILED",
        error: "Truncated packet at offset 0x8B1200.",
      },
      { filename: "vpn-gw-05.pcap", iteration: 2, status: "PARSED" },
      { filename: "vpn-gw-06.pcap", iteration: 2, status: "PARSED" },
      { filename: "vpn-gw-07.pcap", iteration: 3, status: "PARSED" },
      { filename: "vpn-gw-08.pcap", iteration: 3, status: "PARSED" },
      { filename: "vpn-gw-09.pcap", iteration: 4, status: "PARSED" },
      {
        filename: "vpn-gw-10.pcap",
        iteration: 4,
        status: "FAILED",
        error: "Unsupported encapsulation type 0xFE.",
      },
      { filename: "vpn-gw-11.pcap", iteration: 5, status: "PARSED" },
      { filename: "vpn-gw-12.pcap", iteration: 5, status: "PARSED" },
    ],
  },
  {
    id: "batch-0400",
    type: "project_b",
    title: "Aug metrics baseline",
    owner: "alice",
    minutesAgo: 28_800,
    durationMin: 5,
    source: "Web upload",
    parser: "csv-loader 1.9.0",
    tables: ["metrics"],
    baseBytes: 27 * MB,
    files: sameFiles(6, (n) => `aug_metrics_${pad(n)}.csv`),
  },
  {
    id: "batch-0399",
    type: "netflow",
    title: "Spine switch telemetry",
    owner: "bob",
    minutesAgo: 32_400,
    durationMin: 10,
    source: "API key · siem-export",
    parser: "parquet-loader 1.4.0",
    tables: ["flows", "flow_summary"],
    baseBytes: 340 * MB,
    files: sameFiles(10, (n) => `spine-tel-${pad(n, 4)}.parquet`),
  },
  {
    id: "batch-0398",
    type: "pcap",
    title: "Egress firewall logs",
    owner: "diana",
    minutesAgo: 36_000,
    durationMin: 16,
    source: "Web upload",
    parser: "pcap-parser 2.3.1",
    tables: ["packets", "connections", "http_requests"],
    baseBytes: 260 * MB,
    files: sameFiles(16, (n) => `egress-fw-${pad(n)}.pcap`),
  },
  {
    id: "batch-0397",
    type: "project_b",
    title: null,
    owner: "charlie",
    minutesAgo: 40_320,
    durationMin: 1,
    source: "API key · ci-nightly",
    parser: "json-loader 1.2.0",
    tables: [],
    baseBytes: 5 * MB,
    files: sameFiles(
      6,
      (n) => `dump_${pad(n)}.json`,
      "FAILED",
      'Missing required field "event_type".',
    ),
  },
];

// ── Pipelines ─────────────────────────────────────────────────

/** Pipeline submitted per ingest type: parser → the analyses fed by its output. */
const PIPELINES: Record<string, Record<string, string[]>> = {
  pcap: {
    PcapParser: ["ConnectionAnalysis", "DnsAnalysis", "HttpAnalysis"],
    TlsParser: ["CertAnalysis", "Ja3Analysis"],
  },
  netflow: { FlowParser: ["FlowSummary", "TopTalkers"] },
  project_b: {
    CsvParser: ["EventAnalysis", "MetricsAnalysis"],
    JsonParser: ["AlertCorrelation"],
  },
};

/** Mock tables keyed by batch_id instead of the default run_id. */
const BATCH_ID_TABLES = new Set(["TopTalkers", "Ja3Analysis"]);

/** Step statuses follow the batch's files: parsers run with them, analyses run after. */
function buildPipeline(batch: BatchDetail): PipelineBranch[] {
  const template = PIPELINES[batch.ingest_type] ?? {};
  const { files } = batch;
  const failed = files.filter((f) => f.status === "FAILED").length;

  let parserStatus: PipelineStepStatus = "FINISHED";
  if (!batch.started_at) parserStatus = "QUEUED";
  else if (files.some(isActiveFile)) parserStatus = "PROCESSING";
  else if (failed === files.length) parserStatus = "FAILED";

  return Object.entries(template).map(([parser, analyses]) => ({
    parser: { name: parser, status: parserStatus },
    analyses: analyses.map((name, i) => {
      let status: PipelineStepStatus = "QUEUED";
      if (parserStatus === "FINISHED") {
        // Batches with some failed files fail their last analysis, to show the red state.
        status = failed > 0 && i === analyses.length - 1 ? "FAILED" : "FINISHED";
      } else if (parserStatus === "PROCESSING" && i === 0) {
        status = "PROCESSING";
      } else if (parserStatus === "FAILED") {
        status = "FAILED"; // nothing to analyse
      }
      return {
        name,
        status,
        ...(BATCH_ID_TABLES.has(name) && { filter_by: "batch_id" as const }),
      };
    }),
  }));
}

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
  batch.pipeline = buildPipeline(batch);
}

function buildBatch(seed: SeedBatch, now: number): BatchDetail {
  const created = now - seed.minutesAgo * MINUTE;
  const started = seed.files.some((f) => f.status !== "QUEUED") ? created + 20_000 : null;
  const finished =
    seed.durationMin !== undefined && started !== null
      ? started + seed.durationMin * MINUTE
      : null;

  const files: BatchFile[] = seed.files.map((seedFile, i) => {
    const { filename, iteration, status } = seedFile;
    const size = Math.round(seed.baseBytes * (1 + ((i * 37) % 23) / 20));
    const fileStart = started !== null && status !== "QUEUED" ? started + i * 30_000 : null;
    const done = status === "PARSED" || status === "FAILED";
    const fileEnd = done && fileStart !== null ? fileStart + Math.max(5_000, size / 20_000) : null;

    let rows: number | null = null;
    if (status === "PARSED") rows = Math.round(size / 180);
    if (status === "PROCESSING") rows = Math.round(size / 400);

    return {
      job_id: `job_${seed.id.slice(-4)}_${pad(i + 1, 3)}`,
      filename,
      iteration,
      size_bytes: size,
      status,
      progress: status === "PROCESSING" ? (i % 2 ? 35 : 70) : null,
      rows_written: rows,
      error: status === "FAILED" ? (seedFile.error ?? "Parser exited with an error.") : null,
      started_at: iso(fileStart),
      finished_at: iso(fileEnd),
    };
  });

  const batch: BatchDetail = {
    batch_id: seed.id,
    run_id: `run-${seed.id.slice(-4)}`,
    ingest_type: seed.type,
    title: seed.title,
    owner: seed.owner,
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
    pipeline: [],
    note_count: 0,
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
    title: batch.title,
    owner: batch.owner,
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

export async function mockListBatches(
  params: ListBatchesParams = {},
): Promise<BatchListResponse> {
  await delay(300);
  tick();

  const all = store.map(toSummary);
  const statuses = all.map(getBatchStatus);
  const countFor = (filter: BatchFilter) => statuses.filter(FILTER_MATCH[filter]).length;

  const q = params.q?.trim().toLowerCase() ?? "";
  const matches = all.filter(
    (b, i) =>
      FILTER_MATCH[params.filter ?? "all"](statuses[i]!) &&
      (!q ||
        [b.batch_id, b.title, b.owner, b.ingest_type].some((v) =>
          v?.toLowerCase().includes(q),
        )),
  );

  const { page, pageSize } = params;
  const batches =
    page && pageSize ? matches.slice((page - 1) * pageSize, page * pageSize) : matches;
  return {
    batches,
    total: matches.length,
    counts: {
      all: all.length,
      active: countFor("active"),
      attention: countFor("attention"),
      completed: countFor("completed"),
    },
    has_active: statuses.some(isActiveStatus),
  };
}

export async function mockGetBatch(batchId: string): Promise<BatchDetail> {
  await delay(250);
  tick();
  const batch = store.find((b) => b.batch_id === batchId);
  if (!batch) throw notFound(batchId);
  return { ...structuredClone(batch), note_count: notes.get(batchId)?.length ?? 0 };
}

export async function mockDeleteBatch(batchId: string): Promise<void> {
  await delay(400);
  if (!store.some((b) => b.batch_id === batchId)) throw notFound(batchId);
  store = store.filter((b) => b.batch_id !== batchId);
  notes.delete(batchId);
}

// ── Notes ─────────────────────────────────────────────────────

const notes = new Map<string, BatchNote[]>([
  [
    "batch-0417",
    [
      {
        id: "note-1",
        batch_id: "batch-0417",
        author: "alice",
        body: "edge-03 and edge-09 are from the old sensor firmware, re-capture pending.",
        created_at: iso(Date.now() - 50 * MINUTE)!,
        updated_at: null,
      },
    ],
  ],
]);
let nextNoteId = 2;

function findNote(batchId: string, noteId: string): BatchNote {
  const note = notes.get(batchId)?.find((n) => n.id === noteId);
  if (!note) {
    throw new ApiError({ code: "SERVER_ERROR", status: 404, message: "Note not found" });
  }
  return note;
}

export async function mockListBatchNotes(batchId: string): Promise<BatchNote[]> {
  await delay(200);
  return structuredClone(notes.get(batchId) ?? []);
}

export async function mockAddBatchNote(batchId: string, input: NewBatchNote): Promise<BatchNote> {
  await delay(200);
  const note: BatchNote = {
    id: `note-${nextNoteId++}`,
    batch_id: batchId,
    author: input.author,
    body: input.body,
    created_at: new Date().toISOString(),
    updated_at: null,
  };
  notes.set(batchId, [...(notes.get(batchId) ?? []), note]);
  return structuredClone(note);
}

export async function mockUpdateBatchNote(
  batchId: string,
  noteId: string,
  body: string,
): Promise<BatchNote> {
  await delay(200);
  const note = findNote(batchId, noteId);
  note.body = body;
  note.updated_at = new Date().toISOString();
  return structuredClone(note);
}

export async function mockDeleteBatchNote(batchId: string, noteId: string): Promise<void> {
  await delay(200);
  findNote(batchId, noteId);
  notes.set(batchId, notes.get(batchId)!.filter((n) => n.id !== noteId));
}
