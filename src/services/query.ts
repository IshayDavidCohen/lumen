import { apiPost } from "./api";
import { mockExecuteQuery } from "./mock";
import type { QueryRequest, QueryResponse } from "@/constants/apiTypes";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

export async function executeQuery(sql: string): Promise<QueryResponse> {
  if (USE_MOCK) return mockExecuteQuery(sql);

  const body: QueryRequest = { sql };
  return apiPost<QueryResponse>("/query", body);
}
