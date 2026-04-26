import type { UploadStatus } from "./apiTypes";

interface StatusConfig {
  label: string;
  color: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  progressClass: string;
}

export const STATUS_CONFIG: Record<UploadStatus, StatusConfig> = {
  UPLOADED: {
    label: "Uploaded",
    color: "blue",
    bgClass: "bg-blue-500/10",
    textClass: "text-blue-400",
    borderClass: "border-blue-500/30",
    progressClass: "bg-blue-500",
  },
  QUEUED: {
    label: "Queued",
    color: "amber",
    bgClass: "bg-amber-500/10",
    textClass: "text-amber-400",
    borderClass: "border-amber-500/30",
    progressClass: "bg-amber-500",
  },
  PROCESSING: {
    label: "Processing",
    color: "teal",
    bgClass: "bg-teal-500/10",
    textClass: "text-teal-400",
    borderClass: "border-teal-500/30",
    progressClass: "bg-teal-500",
  },
  PARSED: {
    label: "Parsed",
    color: "green",
    bgClass: "bg-green-500/10",
    textClass: "text-green-400",
    borderClass: "border-green-500/30",
    progressClass: "bg-green-500",
  },
  FAILED: {
    label: "Failed",
    color: "red",
    bgClass: "bg-red-500/10",
    textClass: "text-red-400",
    borderClass: "border-red-500/30",
    progressClass: "bg-red-500",
  },
};

export const TERMINAL_STATUSES: UploadStatus[] = ["PARSED", "FAILED"];

export function isTerminalStatus(status: UploadStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}