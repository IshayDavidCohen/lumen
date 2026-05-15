import type { ChartConfig } from "@/constants/apiTypes";

// ── Types ─────────────────────────────────────────────────────

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string;
  tags: string[];
  datasetType?: string;
  chartConfig?: ChartConfig;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunRowCount?: number;
  lastRunDurationMs?: number;
}

export interface SavedQueryListResponse {
  queries: SavedQuery[];
  total: number;
}

// ── Storage helpers ───────────────────────────────────────────

const STORAGE_KEY = "lumen-saved-queries";

const SEED_QUERIES: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "All HTTP traffic",
    sql: "SELECT * FROM http_requests ORDER BY timestamp DESC LIMIT 100",
    tags: ["http", "overview"],
  },
  {
    name: "Top talkers",
    sql: "SELECT src_ip, COUNT(*) as count FROM packets GROUP BY src_ip ORDER BY count DESC LIMIT 20",
    tags: ["network", "top-n"],
  },
  {
    name: "DNS anomalies",
    sql: "SELECT * FROM dns_queries WHERE query_type NOT IN ('A','AAAA','CNAME') ORDER BY timestamp DESC",
    tags: ["dns", "anomaly"],
  },
  {
    name: "Flow volume by hour",
    sql: "SELECT DATE_TRUNC('hour', start_time) as hour, SUM(bytes) as total_bytes FROM flows GROUP BY hour ORDER BY hour",
    tags: ["netflow", "timeseries"],
  },
];

function readStore(): SavedQuery[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedQuery[];
  } catch {
    return [];
  }
}

function writeStore(queries: SavedQuery[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
}

function ensureSeeded(): void {
  if (localStorage.getItem(STORAGE_KEY) !== null) return;
  const now = Date.now();
  const seeded: SavedQuery[] = SEED_QUERIES.map((q, i) => ({
    ...q,
    id: crypto.randomUUID(),
    createdAt: now - (SEED_QUERIES.length - i) * 3_600_000,
    updatedAt: now - (SEED_QUERIES.length - i) * 3_600_000,
  }));
  writeStore(seeded);
}

// Seed on module load
ensureSeeded();

// ── Service API (async for future REST swap) ──────────────────

export async function listSavedQueries(
  _signal?: AbortSignal,
): Promise<SavedQueryListResponse> {
  const queries = readStore();
  return { queries, total: queries.length };
}

export async function getSavedQuery(
  id: string,
  _signal?: AbortSignal,
): Promise<SavedQuery> {
  const queries = readStore();
  const found = queries.find((q) => q.id === id);
  if (!found) throw new Error(`Saved query not found: ${id}`);
  return found;
}

export async function createSavedQuery(
  query: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">,
): Promise<SavedQuery> {
  const now = Date.now();
  const newQuery: SavedQuery = {
    ...query,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  const queries = readStore();
  queries.unshift(newQuery);
  writeStore(queries);
  return newQuery;
}

export async function updateSavedQuery(
  id: string,
  patch: Partial<SavedQuery>,
): Promise<SavedQuery> {
  const queries = readStore();
  const idx = queries.findIndex((q) => q.id === id);
  if (idx === -1) throw new Error(`Saved query not found: ${id}`);
  const updated: SavedQuery = {
    ...queries[idx]!,
    ...patch,
    id,
    updatedAt: Date.now(),
  };
  queries[idx] = updated;
  writeStore(queries);
  return updated;
}

export async function deleteSavedQuery(id: string): Promise<void> {
  const queries = readStore();
  writeStore(queries.filter((q) => q.id !== id));
}
