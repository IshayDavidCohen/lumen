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
