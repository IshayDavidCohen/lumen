import type { Column } from "@/constants/apiTypes";

export function rowsToCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => c.name).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = row[c.name];
          if (val === null || val === undefined) return "";
          const str = String(val);
          return str.includes(",") || str.includes('"') || str.includes("\n")
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function rowsToJson(rows: Record<string, unknown>[], pretty = true): string {
  return JSON.stringify(rows, null, pretty ? 2 : undefined);
}

export function rowsToTsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => c.name).join("\t");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = row[c.name];
          if (val === null || val === undefined) return "";
          return String(val).replace(/\t/g, " ").replace(/\n/g, " ");
        })
        .join("\t"),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function downloadAsFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
