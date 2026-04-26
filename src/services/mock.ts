import type {
  UploadResponse,
  DatasetTypesResponse,
  JobStatusMessage,
  UploadStatus,
  TablesResponse,
  TableDataResponse,
  TableInfo,
  Column,
  QueryResponse,
} from "@/constants/apiTypes";
import type { WebSocketConnection } from "./ws";

const MOCK_TYPES = ["pcap", "project_b", "netflow"];

const FAIL_RATE = 0.1;

let jobCounter = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Ingest mocks ──────────────────────────────────────────────

export async function mockGetDatasetTypes(): Promise<DatasetTypesResponse> {
  await delay(400);
  return { types: MOCK_TYPES };
}

export async function mockUploadFile(
  _file: File,
  _ingestType: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const steps = 10;
  const stepDelay = 150;

  for (let i = 1; i <= steps; i++) {
    await delay(stepDelay);
    onProgress?.(Math.round((i / steps) * 100));
  }

  const jobId = `mock-job-${++jobCounter}-${Date.now()}`;
  return { job_id: jobId, status: "UPLOADED" };
}

export function mockConnectJobStatus(
  jobId: string,
  onMessage: (msg: JobStatusMessage) => void,
  _onError?: (error: Event | Error) => void,
  _onClose?: () => void,
): WebSocketConnection {
  let cancelled = false;
  const shouldFail = Math.random() < FAIL_RATE;

  const statuses: Array<{ status: UploadStatus; progress: number; delayMs: number }> = [
    { status: "QUEUED", progress: 0, delayMs: 600 },
    { status: "PROCESSING", progress: 20, delayMs: 800 },
    { status: "PROCESSING", progress: 50, delayMs: 700 },
    { status: "PROCESSING", progress: 80, delayMs: 600 },
  ];

  if (shouldFail) {
    statuses.push({ status: "FAILED", progress: 80, delayMs: 500 });
  } else {
    statuses.push({ status: "PARSED", progress: 100, delayMs: 500 });
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(index: number) {
    if (cancelled || index >= statuses.length) return;

    const step = statuses[index]!;
    timeoutId = setTimeout(() => {
      if (cancelled) return;

      const msg: JobStatusMessage = {
        job_id: jobId,
        status: step.status,
        progress: step.progress,
        ...(step.status === "FAILED" ? { message: "Mock parse failure — simulated error" } : {}),
      };

      onMessage(msg);
      scheduleNext(index + 1);
    }, step.delayMs);
  }

  scheduleNext(0);

  return {
    close() {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

// ── Dataset / table schema mocks ──────────────────────────────

const MOCK_TABLES: Record<string, TableInfo[]> = {
  pcap: [
    {
      name: "packets",
      row_count: 248_531,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "timestamp", type: "date", nullable_pct: 0 },
        { name: "src_ip", type: "string", nullable_pct: 0 },
        { name: "dst_ip", type: "string", nullable_pct: 0 },
        { name: "src_port", type: "number", nullable_pct: 0 },
        { name: "dst_port", type: "number", nullable_pct: 0 },
        { name: "protocol", type: "string", nullable_pct: 0 },
        { name: "length", type: "number", nullable_pct: 0 },
        { name: "info", type: "string", nullable_pct: 12 },
      ],
    },
    {
      name: "connections",
      row_count: 18_420,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "start_time", type: "date", nullable_pct: 0 },
        { name: "end_time", type: "date", nullable_pct: 5 },
        { name: "src_ip", type: "string", nullable_pct: 0 },
        { name: "dst_ip", type: "string", nullable_pct: 0 },
        { name: "src_port", type: "number", nullable_pct: 0 },
        { name: "dst_port", type: "number", nullable_pct: 0 },
        { name: "protocol", type: "string", nullable_pct: 0 },
        { name: "bytes_sent", type: "number", nullable_pct: 0 },
        { name: "bytes_recv", type: "number", nullable_pct: 0 },
        { name: "packets_count", type: "number", nullable_pct: 0 },
        { name: "state", type: "string", nullable_pct: 3 },
      ],
    },
    {
      name: "dns_queries",
      row_count: 42_187,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "timestamp", type: "date", nullable_pct: 0 },
        { name: "src_ip", type: "string", nullable_pct: 0 },
        { name: "query_name", type: "string", nullable_pct: 0 },
        { name: "query_type", type: "string", nullable_pct: 0 },
        { name: "response_code", type: "string", nullable_pct: 8 },
        { name: "resolved_ip", type: "string", nullable_pct: 22 },
        { name: "ttl", type: "number", nullable_pct: 15 },
      ],
    },
    {
      name: "http_requests",
      row_count: 15_893,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "timestamp", type: "date", nullable_pct: 0 },
        { name: "src_ip", type: "string", nullable_pct: 0 },
        { name: "dst_ip", type: "string", nullable_pct: 0 },
        { name: "method", type: "string", nullable_pct: 0 },
        { name: "host", type: "string", nullable_pct: 2 },
        { name: "path", type: "string", nullable_pct: 0 },
        { name: "status_code", type: "number", nullable_pct: 6 },
        { name: "content_type", type: "string", nullable_pct: 18 },
        { name: "content_length", type: "number", nullable_pct: 25 },
        { name: "user_agent", type: "string", nullable_pct: 10 },
      ],
    },
  ],
  project_b: [
    {
      name: "events",
      row_count: 95_210,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "timestamp", type: "date", nullable_pct: 0 },
        { name: "event_type", type: "string", nullable_pct: 0 },
        { name: "source", type: "string", nullable_pct: 0 },
        { name: "severity", type: "string", nullable_pct: 0 },
        { name: "message", type: "string", nullable_pct: 5 },
        { name: "acknowledged", type: "boolean", nullable_pct: 0 },
      ],
    },
    {
      name: "metrics",
      row_count: 312_000,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "timestamp", type: "date", nullable_pct: 0 },
        { name: "metric_name", type: "string", nullable_pct: 0 },
        { name: "value", type: "number", nullable_pct: 0 },
        { name: "unit", type: "string", nullable_pct: 0 },
        { name: "host", type: "string", nullable_pct: 0 },
        { name: "tags", type: "string", nullable_pct: 30 },
      ],
    },
  ],
  netflow: [
    {
      name: "flows",
      row_count: 1_540_000,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "start_time", type: "date", nullable_pct: 0 },
        { name: "end_time", type: "date", nullable_pct: 0 },
        { name: "src_ip", type: "string", nullable_pct: 0 },
        { name: "dst_ip", type: "string", nullable_pct: 0 },
        { name: "src_port", type: "number", nullable_pct: 0 },
        { name: "dst_port", type: "number", nullable_pct: 0 },
        { name: "protocol", type: "number", nullable_pct: 0 },
        { name: "bytes", type: "number", nullable_pct: 0 },
        { name: "packets", type: "number", nullable_pct: 0 },
        { name: "tcp_flags", type: "string", nullable_pct: 20 },
      ],
    },
    {
      name: "flow_summary",
      row_count: 8_400,
      columns: [
        { name: "id", type: "number", nullable_pct: 0 },
        { name: "date", type: "date", nullable_pct: 0 },
        { name: "total_flows", type: "number", nullable_pct: 0 },
        { name: "total_bytes", type: "number", nullable_pct: 0 },
        { name: "total_packets", type: "number", nullable_pct: 0 },
        { name: "unique_src_ips", type: "number", nullable_pct: 0 },
        { name: "unique_dst_ips", type: "number", nullable_pct: 0 },
        { name: "top_protocol", type: "string", nullable_pct: 0 },
      ],
    },
  ],
};

export async function mockGetTables(type: string): Promise<TablesResponse> {
  await delay(300);
  const tables = MOCK_TABLES[type] ?? [];
  return { tables };
}

// ── Row data generation ───────────────────────────────────────

const PROTOCOLS = ["TCP", "UDP", "ICMP", "DNS", "HTTP", "TLS", "SSH"];
const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"];
const SEVERITIES = ["info", "warning", "error", "critical"];
const EVENT_TYPES = ["login", "logout", "alert", "config_change", "scan", "connection"];
const DNS_TYPES = ["A", "AAAA", "CNAME", "MX", "NS", "TXT", "SRV"];
const RCODES = ["NOERROR", "NXDOMAIN", "SERVFAIL", "REFUSED"];
const HOSTS = ["api.internal.net", "db-01.corp", "web-proxy.local", "ntp.pool.local", "mail.corp.io"];
const TCP_FLAGS = ["SYN", "SYN-ACK", "ACK", "FIN", "RST", "PSH-ACK"];
const UNITS = ["ms", "bytes", "%", "req/s", "conn/s"];
const METRIC_NAMES = ["cpu_usage", "mem_usage", "disk_io", "net_throughput", "latency_p99", "error_rate"];
const STATUS_CODES = [200, 200, 200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503];

function randomIp(): string {
  return `10.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
}

function randomPort(): number {
  return Math.random() > 0.3
    ? [80, 443, 8080, 22, 53, 3306, 5432, 8443][Math.floor(Math.random() * 8)]!
    : Math.floor(Math.random() * 64000) + 1024;
}

function randomDate(offsetDays = 30): string {
  const d = new Date(Date.now() - Math.random() * offsetDays * 86_400_000);
  return d.toISOString();
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function nullable<T>(value: T, pct: number): T | null {
  return Math.random() * 100 < pct ? null : value;
}

type RowGenerator = (id: number) => Record<string, unknown>;

const ROW_GENERATORS: Record<string, RowGenerator> = {
  packets: (id) => ({
    id,
    timestamp: randomDate(),
    src_ip: randomIp(),
    dst_ip: randomIp(),
    src_port: randomPort(),
    dst_port: randomPort(),
    protocol: pick(PROTOCOLS),
    length: Math.floor(Math.random() * 1500) + 40,
    info: nullable(`Seq=${Math.floor(Math.random() * 100000)} Ack=${Math.floor(Math.random() * 100000)}`, 12),
  }),
  connections: (id) => ({
    id,
    start_time: randomDate(),
    end_time: nullable(randomDate(), 5),
    src_ip: randomIp(),
    dst_ip: randomIp(),
    src_port: randomPort(),
    dst_port: randomPort(),
    protocol: pick(PROTOCOLS),
    bytes_sent: Math.floor(Math.random() * 500000),
    bytes_recv: Math.floor(Math.random() * 2000000),
    packets_count: Math.floor(Math.random() * 5000) + 1,
    state: nullable(pick(["ESTABLISHED", "CLOSED", "TIME_WAIT", "SYN_SENT"]), 3),
  }),
  dns_queries: (id) => ({
    id,
    timestamp: randomDate(),
    src_ip: randomIp(),
    query_name: pick(["google.com", "github.com", "internal.corp", "cdn.assets.io", "api.service.local", "mx.mail.corp"]),
    query_type: pick(DNS_TYPES),
    response_code: nullable(pick(RCODES), 8),
    resolved_ip: nullable(randomIp(), 22),
    ttl: nullable(Math.floor(Math.random() * 86400), 15),
  }),
  http_requests: (id) => ({
    id,
    timestamp: randomDate(),
    src_ip: randomIp(),
    dst_ip: randomIp(),
    method: pick(METHODS),
    host: nullable(pick(HOSTS), 2),
    path: pick(["/api/v1/users", "/api/v1/data", "/health", "/login", "/static/app.js", "/graphql", "/api/v2/query"]),
    status_code: nullable(pick(STATUS_CODES), 6),
    content_type: nullable(pick(["application/json", "text/html", "image/png", "text/css"]), 18),
    content_length: nullable(Math.floor(Math.random() * 500000), 25),
    user_agent: nullable(pick(["Mozilla/5.0", "curl/7.68", "Python/3.9 requests", "Go-http-client/2.0"]), 10),
  }),
  events: (id) => ({
    id,
    timestamp: randomDate(),
    event_type: pick(EVENT_TYPES),
    source: pick(["firewall", "ids", "proxy", "endpoint", "dns-server"]),
    severity: pick(SEVERITIES),
    message: nullable(`Event on ${pick(HOSTS)}: ${pick(EVENT_TYPES)} detected`, 5),
    acknowledged: Math.random() > 0.3,
  }),
  metrics: (id) => ({
    id,
    timestamp: randomDate(),
    metric_name: pick(METRIC_NAMES),
    value: Math.round(Math.random() * 10000) / 100,
    unit: pick(UNITS),
    host: pick(HOSTS),
    tags: nullable(`env=prod,region=${pick(["us-east", "eu-west", "ap-south"])}`, 30),
  }),
  flows: (id) => ({
    id,
    start_time: randomDate(),
    end_time: randomDate(),
    src_ip: randomIp(),
    dst_ip: randomIp(),
    src_port: randomPort(),
    dst_port: randomPort(),
    protocol: pick([6, 17, 1]),
    bytes: Math.floor(Math.random() * 10_000_000),
    packets: Math.floor(Math.random() * 50000) + 1,
    tcp_flags: nullable(pick(TCP_FLAGS), 20),
  }),
  flow_summary: (id) => ({
    id,
    date: randomDate(90),
    total_flows: Math.floor(Math.random() * 500000) + 10000,
    total_bytes: Math.floor(Math.random() * 50_000_000_000),
    total_packets: Math.floor(Math.random() * 100_000_000),
    unique_src_ips: Math.floor(Math.random() * 5000) + 100,
    unique_dst_ips: Math.floor(Math.random() * 10000) + 200,
    top_protocol: pick(PROTOCOLS),
  }),
};

function generateRows(tableName: string, count: number, startId: number): Record<string, unknown>[] {
  const gen = ROW_GENERATORS[tableName];
  if (!gen) return [];
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    rows.push(gen(startId + i));
  }
  return rows;
}

function getTableInfo(type: string, name: string): TableInfo | undefined {
  return MOCK_TABLES[type]?.find((t) => t.name === name);
}

export async function mockGetTableData(
  type: string,
  name: string,
  page: number,
  pageSize: number,
  _sortBy?: string,
  _sortDir?: string,
): Promise<TableDataResponse> {
  await delay(200);
  const table = getTableInfo(type, name);
  if (!table) return { rows: [], total: 0, page, pageSize };

  const total = table.row_count;
  const startId = (page - 1) * pageSize + 1;
  const count = Math.min(pageSize, total - startId + 1);
  const rows = count > 0 ? generateRows(name, count, startId) : [];

  return { rows, total, page, pageSize };
}

// ── Query mock ────────────────────────────────────────────────

export async function mockExecuteQuery(sql: string): Promise<QueryResponse> {
  await delay(500);

  const lower = sql.toLowerCase().trim();

  for (const [type, tables] of Object.entries(MOCK_TABLES)) {
    for (const table of tables) {
      if (lower.includes(table.name)) {
        const rows = generateRows(table.name, Math.min(50, table.row_count), 1);
        return {
          columns: table.columns,
          rows,
          row_count: rows.length,
        };
      }
    }
    void type;
  }

  const fallbackColumns: Column[] = [
    { name: "id", type: "number", nullable_pct: 0 },
    { name: "result", type: "string", nullable_pct: 0 },
  ];
  return {
    columns: fallbackColumns,
    rows: [
      { id: 1, result: "Query executed — no matching mock table found" },
    ],
    row_count: 1,
  };
}
