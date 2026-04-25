import { CheckCircle2 } from "lucide-react";
import type { UploadStatus } from "@/constants/apiTypes";

type ExtendedStatus = UploadStatus | "PENDING" | "UPLOADING" | "REJECTED";

interface StatusBadgeProps {
  status: ExtendedStatus;
}

const STATUS_STYLES: Record<ExtendedStatus, { label: string; classes: string }> = {
  PENDING: {
    label: "Pending",
    classes: "dark:bg-zinc-500/10 dark:text-zinc-400 light:bg-zinc-100 light:text-zinc-600",
  },
  UPLOADING: {
    label: "Uploading",
    classes: "dark:bg-blue-500/10 dark:text-blue-400 light:bg-blue-50 light:text-blue-700",
  },
  UPLOADED: {
    label: "Uploaded",
    classes: "dark:bg-blue-500/10 dark:text-blue-400 light:bg-blue-50 light:text-blue-700",
  },
  QUEUED: {
    label: "Queued",
    classes: "dark:bg-amber-500/10 dark:text-amber-400 light:bg-amber-50 light:text-amber-700",
  },
  PROCESSING: {
    label: "Processing",
    classes: "dark:bg-teal-500/10 dark:text-teal-400 light:bg-teal-50 light:text-teal-700",
  },
  PARSED: {
    label: "Parsed",
    classes: "dark:bg-green-500/10 dark:text-green-400 light:bg-green-50 light:text-green-700",
  },
  FAILED: {
    label: "Failed",
    classes: "dark:bg-red-500/10 dark:text-red-400 light:bg-red-50 light:text-red-700",
  },
  REJECTED: {
    label: "Rejected",
    classes: "dark:bg-red-500/10 dark:text-red-400 light:bg-red-50 light:text-red-700",
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_STYLES[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {status === "PARSED" && (
        <CheckCircle2 size={12} className="animate-check-pop" />
      )}
      {config.label}
    </span>
  );
}
