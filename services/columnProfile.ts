import type {
  ColumnProfileRequest,
  ColumnProfileResponse,
  ColumnProfileNumeric,
  ColumnProfileString,
  ColumnProfileDate,
  Column,
} from "@/constants/apiTypes";
import { apiPost } from "./api";

const USE_MOCK = import.meta.env.VITE_MOCK === "true";

export async function getColumnProfile(
  params: ColumnProfileRequest,
  signal?: AbortSignal,
): Promise<ColumnProfileResponse> {
  if (USE_MOCK) return mockComputeProfile(params);
  return apiPost<ColumnProfileResponse>("/datasets/column-profile", params, signal);
}

// ── Mock profiler (computes real stats from mock generators) ──

async function mockComputeProfile(
  params: ColumnProfileRequest,
): Promise<ColumnProfileResponse> {
  const { mockGetTableData } = await import("./mock");

  await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));

  const sampleSize = params.sampleSize ?? 10_000;
  const pageSize = Math.min(sampleSize, 5000);
  const pages = Math.ceil(sampleSize / pageSize);
  const allRows: Record<string, unknown>[] = [];

  for (let p = 1; p <= pages; p++) {
    const result = await mockGetTableData(
      params.datasetType,
      params.tableName,
      p,
      pageSize,
    );
    allRows.push(...result.rows);
    if (allRows.length >= sampleSize) break;
  }

  const rows = allRows.slice(0, sampleSize);
  const totalRows = rows.length > 0 ? sampleSize * 2 : 0;

  const { mockGetTables } = await import("./mock");
  const tablesResp = await mockGetTables(params.datasetType);
  const table = tablesResp.tables.find((t) => t.name === params.tableName);
  const col: Column | undefined = table?.columns.find((c) => c.name === params.columnName);
  const colType = col?.type ?? "string";

  const values = rows.map((r) => r[params.columnName]);
  const nonNull = values.filter((v) => v !== null && v !== undefined);
  const nullCount = values.length - nonNull.length;
  const nullPct = values.length > 0 ? Math.round((nullCount / values.length) * 100 * 10) / 10 : 0;

  if (colType === "number") {
    const nums = nonNull.filter((v): v is number => typeof v === "number");
    const sorted = [...nums].sort((a, b) => a - b);
    const count = nums.length;
    const sum = nums.reduce((a, b) => a + b, 0);
    const mean = count > 0 ? sum / count : 0;
    const median = count > 0 ? sorted[Math.floor(count / 2)]! : 0;
    const p25 = count > 0 ? sorted[Math.floor(count * 0.25)]! : 0;
    const p75 = count > 0 ? sorted[Math.floor(count * 0.75)]! : 0;
    const variance =
      count > 0
        ? nums.reduce((acc, v) => acc + (v - mean) ** 2, 0) / count
        : 0;
    const stdDev = Math.sqrt(variance);
    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;

    const binCount = 20;
    const binWidth = max > min ? (max - min) / binCount : 1;
    const histogram: ColumnProfileNumeric["histogram"] = Array.from(
      { length: binCount },
      (_, i) => ({
        binStart: Math.round((min + i * binWidth) * 100) / 100,
        binEnd: Math.round((min + (i + 1) * binWidth) * 100) / 100,
        count: 0,
      }),
    );
    for (const v of nums) {
      let idx = Math.floor((v - min) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      histogram[idx]!.count++;
    }

    const profile: ColumnProfileNumeric = {
      kind: "numeric",
      column: params.columnName,
      count,
      nullCount,
      nullPct,
      min,
      max,
      mean: Math.round(mean * 100) / 100,
      median,
      stdDev: Math.round(stdDev * 100) / 100,
      p25,
      p75,
      histogram,
    };
    return { profile, sampledRows: rows.length, totalRows };
  }

  if (colType === "date") {
    const dates = nonNull
      .map((v) => (typeof v === "string" ? new Date(v).getTime() : NaN))
      .filter((t) => !isNaN(t))
      .sort((a, b) => a - b);

    const minDate = dates[0] ?? Date.now();
    const maxDate = dates[dates.length - 1] ?? Date.now();
    const span = maxDate - minDate;
    const days = Math.round(span / 86_400_000);
    const timespan =
      days > 365 ? `${Math.round(days / 365)} years` :
      days > 30 ? `${Math.round(days / 30)} months` :
      `${days} days`;

    const bucketCount = Math.min(20, Math.max(1, days));
    const bucketWidth = span / bucketCount || 1;
    const histogram: Array<{ bucket: string; count: number }> = Array.from(
      { length: bucketCount },
      (_, i) => ({
        bucket: new Date(minDate + i * bucketWidth).toISOString().slice(0, 10),
        count: 0,
      }),
    );
    for (const t of dates) {
      let idx = Math.floor((t - minDate) / bucketWidth);
      if (idx >= bucketCount) idx = bucketCount - 1;
      histogram[idx]!.count++;
    }

    const profile: ColumnProfileDate = {
      kind: "date",
      column: params.columnName,
      count: dates.length,
      nullCount,
      nullPct,
      min: new Date(minDate).toISOString(),
      max: new Date(maxDate).toISOString(),
      timespan,
      histogram,
    };
    return { profile, sampledRows: rows.length, totalRows };
  }

  // String profile
  const strs = nonNull.map((v) => String(v));
  const freq = new Map<string, number>();
  let minLen = Infinity;
  let maxLen = 0;
  let totalLen = 0;
  for (const s of strs) {
    freq.set(s, (freq.get(s) ?? 0) + 1);
    if (s.length < minLen) minLen = s.length;
    if (s.length > maxLen) maxLen = s.length;
    totalLen += s.length;
  }
  const topValues = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({
      value,
      count,
      pct: strs.length > 0 ? Math.round((count / strs.length) * 100 * 10) / 10 : 0,
    }));

  const profile: ColumnProfileString = {
    kind: "string",
    column: params.columnName,
    count: strs.length,
    nullCount,
    nullPct,
    uniqueCount: freq.size,
    topValues,
    minLength: minLen === Infinity ? 0 : minLen,
    maxLength: maxLen,
    avgLength: strs.length > 0 ? Math.round((totalLen / strs.length) * 10) / 10 : 0,
  };
  return { profile, sampledRows: rows.length, totalRows };
}
