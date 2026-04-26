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
} from "@/constants/apiTypes";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

export async function uploadFile(
  file: File,
  ingestType: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  if (USE_MOCK) return mockUploadFile(file, ingestType, onProgress);

  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<UploadResponse>(`/ingest/${ingestType}`, formData, onProgress);
}

export async function uploadBatch(
  files: File[],
  ingestType: string,
  onProgress?: (progress: number) => void,
): Promise<BatchUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("file", file);
  }
  return apiUpload<BatchUploadResponse>(
    `/ingest/${ingestType}/batch`,
    formData,
    onProgress,
  );
}

export async function getDatasetTypes(): Promise<DatasetTypesResponse> {
  if (USE_MOCK) return mockGetDatasetTypes();
  return apiGet<DatasetTypesResponse>("/datasets/types");
}

export async function getTables(type: string): Promise<TablesResponse> {
  if (USE_MOCK) return mockGetTables(type);
  return apiGet<TablesResponse>(`/datasets/${type}/tables`);
}

export interface TableDataParams {
  type: string;
  name: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  filters?: Record<string, string>;
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
  return apiGet<TableDataResponse>(path);
}
