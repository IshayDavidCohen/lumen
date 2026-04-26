import { CheckCircle2 } from "lucide-react";
import type { UploadStatus } from "@/constants/apiTypes";

type ExtendedStatus = UploadStatus | "PENDING" | "UPLOADING" | "REJECTED";

interface StatusBadgeProps {
  status: ExtendedStatus;
}

const STATUS_STYLES: Record<ExtendedStatus, { label: string; classes: string }> = {
  PENDING: {
    label: "Pending",
    classes: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400",
  },
  UPLOADING: {
    label: "Uploading",
    classes: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  UPLOADED: {
    label: "Uploaded",
    classes: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  },
  QUEUED: {
    label: "Queued",
    classes: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  },
  PROCESSING: {
    label: "Processing",
    classes: "bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-400",
  },
  PARSED: {
    label: "Parsed",
    classes: "bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  },
  FAILED: {
    label: "Failed",
    classes: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  },
  REJECTED: {
    label: "Rejected",
    classes: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
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
