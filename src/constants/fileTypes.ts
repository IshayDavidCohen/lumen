export const ALLOWED_EXTENSIONS = [
  ".csv",
  ".json",
  ".parquet",
  ".xlsx",
  ".pcap",
] as const;

export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];

export const ALLOWED_MIME_TYPES: Record<string, AllowedExtension> = {
  "text/csv": ".csv",
  "application/json": ".json",
  "application/vnd.apache.parquet": ".parquet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.tcpdump.pcap": ".pcap",
  "application/x-pcap": ".pcap",
  "application/octet-stream": ".pcap",
};

export function isAllowedFile(file: File): boolean {
  const ext = getFileExtension(file.name);
  return ALLOWED_EXTENSIONS.includes(ext as AllowedExtension);
}

export function getFileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
