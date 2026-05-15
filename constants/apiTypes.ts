export type UploadStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PROCESSING"
  | "PARSED"
  | "FAILED";

export interface Column {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "unknown";
  nullable_pct: number;
}

export type ApiErrorCode =
  | "UPLOAD_FAILED"
  | "PARSE_TIMEOUT"
  | "INVALID_FILE_TYPE"
  | "SERVER_ERROR"
  | "NETWORK_ERROR";

export interface ApiErrorResponse {
  code: ApiErrorCode;
  status?: number;
  message: string;
  detail?: string;
}

export interface UploadResponse {
  job_id: string;
  status: UploadStatus;
}

export interface BatchUploadResponse {
  jobs: Array<{
    job_id: string;
    filename: string;
    status: UploadStatus;
  }>;
}

export interface JobStatusMessage {
  job_id: string;
  status: UploadStatus;
  message?: string;
  progress?: number;
}

export interface DatasetTypesResponse {
  types: string[];
}

export interface TableInfo {
  name: string;
  row_count: number;
  columns: Column[];
}

export interface TablesResponse {
  tables: TableInfo[];
}

export interface TableDataResponse {
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
}

export interface QueryRequest {
  sql: string;
}

export interface QueryResponse {
  columns: Column[];
  rows: Record<string, unknown>[];
  row_count: number;
}

// ── Chart types ───────────────────────────────────────────────

export type ChartType = "bar" | "line" | "scatter" | "histogram";

export interface ChartConfig {
  id: string;
  name: string;
  type: ChartType;
  xColumn: string;
  yColumn: string;
  groupByColumn?: string;
  colorColumn?: string;
  binCount?: number;
  createdAt: number;
  datasetType?: string;
  tableName?: string;
}

// ── Column profiling ──────────────────────────────────────────

export interface ColumnProfileNumeric {
  kind: "numeric";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  histogram: Array<{ binStart: number; binEnd: number; count: number }>;
}

export interface ColumnProfileString {
  kind: "string";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  uniqueCount: number;
  topValues: Array<{ value: string; count: number; pct: number }>;
  minLength: number;
  maxLength: number;
  avgLength: number;
}

export interface ColumnProfileDate {
  kind: "date";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  min: string;
  max: string;
  timespan: string;
  histogram: Array<{ bucket: string; count: number }>;
}

export type ColumnProfile =
  | ColumnProfileNumeric
  | ColumnProfileString
  | ColumnProfileDate;

export interface ColumnProfileRequest {
  datasetType: string;
  tableName: string;
  columnName: string;
  sampleSize?: number;
}

export interface ColumnProfileResponse {
  profile: ColumnProfile;
  sampledRows: number;
  totalRows: number;
}

// ── Network topology ──────────────────────────────────────────

export interface TopologyNode {
  id: string;
  label: string;
  connections: number;
  totalMetric: number;
}

export interface TopologyEdge {
  source: string;
  target: string;
  weight: number;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TopologyConfig {
  sourceColumn: string;
  targetColumn: string;
  metricColumn?: string;
  limit?: number;
}

// ── Settings ──────────────────────────────────────────────────

export interface AppSettings {
  backendUrl: string;
  wsUrl: string;
  mockMode: boolean;
  theme: "light" | "dark";
  defaultPageSize: number;
  maxUploadRetries: number;
  queryTimeout: number;
}

export interface ConnectionHealth {
  http: "connected" | "unreachable" | "checking";
  ws: "connected" | "unreachable" | "checking";
  latencyMs?: number;
  checkedAt?: number;
}
