import { apiPost } from "./api";
import type { QueryRequest, QueryResponse } from "@/constants/apiTypes";

export async function executeQuery(sql: string): Promise<QueryResponse> {
  const body: QueryRequest = { sql };
  return apiPost<QueryResponse>("/query", body);
}
