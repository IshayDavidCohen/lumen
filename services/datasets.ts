import { apiGet, apiUpload } from "./api";
import {
  mockUploadFile,
  mockGetDatasetTypes,
  mockGetTables,
  mockGetTableData,
} from "./mock";
import type {
  UploadResponse,
  BatchUploadResponse,
  DatasetTypesResponse,
  TablesResponse,
  TableDataResponse,
  Column,
} from "@/constants/apiTypes";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

export async function uploadFile(
  file: File,
  ingestType: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<UploadResponse> {
  if (USE_MOCK) return mockUploadFile(file, ingestType, onProgress);

  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<UploadResponse>(`/ingest/${ingestType}`, formData, onProgress, signal);
}

export async function uploadBatch(
  files: File[],
  ingestType: string,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<BatchUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("file", file);
  }
  return apiUpload<BatchUploadResponse>(
    `/ingest/${ingestType}/batch`,
    formData,
    onProgress,
    signal,
  );
}

export async function getDatasetTypes(
  signal?: AbortSignal,
): Promise<DatasetTypesResponse> {
  if (USE_MOCK) return mockGetDatasetTypes();
  return apiGet<DatasetTypesResponse>("/datasets/types", signal);
}

export async function getTables(
  type: string,
  signal?: AbortSignal,
): Promise<TablesResponse> {
  if (USE_MOCK) return mockGetTables(type);
  return apiGet<TablesResponse>(`/datasets/${type}/tables`, signal);
}

export interface TableDataParams {
  type: string;
  name: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  filters?: Record<string, string>;
  signal?: AbortSignal;
}

export async function getTableData(
  params: TableDataParams,
): Promise<TableDataResponse> {
  if (USE_MOCK) {
    return mockGetTableData(
      params.type,
      params.name,
      params.page ?? 1,
      params.pageSize ?? 50,
      params.sortBy,
      params.sortDir,
    );
  }

  const searchParams = new URLSearchParams();
  if (params.page) searchParams.set("page", String(params.page));
  if (params.pageSize) searchParams.set("pageSize", String(params.pageSize));
  if (params.sortBy) searchParams.set("sortBy", params.sortBy);
  if (params.sortDir) searchParams.set("sortDir", params.sortDir);
  if (params.filters)
    searchParams.set("filters", JSON.stringify(params.filters));

  const query = searchParams.toString();
  const path = `/datasets/${params.type}/tables/${params.name}${query ? `?${query}` : ""}`;
  return apiGet<TableDataResponse>(path, params.signal);
}

export async function getAllTableData(
  params: { type: string; name: string; sortBy?: string; sortDir?: "asc" | "desc" },
  onProgress?: (fetchedRows: number, totalRows: number) => void,
  signal?: AbortSignal,
): Promise<{ columns: Column[]; rows: Record<string, unknown>[]; total: number }> {
  if (USE_MOCK) {
    const { mockGetTableData, mockGetTables } = await import("./mock");
    await new Promise((r) => setTimeout(r, 300));
    const tablesResp = await mockGetTables(params.type);
    const table = tablesResp.tables.find((t) => t.name === params.name);
    if (!table) return { columns: [], rows: [], total: 0 };

    const totalRows = Math.min(table.row_count, 10_000);
    const result = await mockGetTableData(params.type, params.name, 1, totalRows, params.sortBy, params.sortDir);
    onProgress?.(result.rows.length, totalRows);
    return { columns: table.columns, rows: result.rows, total: totalRows };
  }

  const first = await getTableData({
    type: params.type,
    name: params.name,
    page: 1,
    pageSize: 50,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    signal,
  });

  const { columns } = await (async () => {
    const tablesResp = await apiGet<TablesResponse>(`/datasets/${params.type}/tables`, signal);
    const table = tablesResp.tables.find((t) => t.name === params.name);
    return { columns: table?.columns ?? [] };
  })();

  const total = first.total;
  const allRows = [...first.rows];
  onProgress?.(allRows.length, total);

  const totalPages = Math.ceil(total / 50);
  const BATCH_SIZE = 3;

  for (let batch = 1; batch * BATCH_SIZE + 1 < totalPages; batch++) {
    if (signal?.aborted) break;
    const pages = Array.from(
      { length: Math.min(BATCH_SIZE, totalPages - batch * BATCH_SIZE) },
      (_, i) => batch * BATCH_SIZE + i + 1,
    );
    const results = await Promise.all(
      pages.map((p) =>
        getTableData({
          type: params.type,
          name: params.name,
          page: p,
          pageSize: 50,
          sortBy: params.sortBy,
          sortDir: params.sortDir,
          signal,
        }),
      ),
    );
    for (const r of results) {
      allRows.push(...r.rows);
    }
    onProgress?.(allRows.length, total);
  }

  return { columns, rows: allRows, total };
}
