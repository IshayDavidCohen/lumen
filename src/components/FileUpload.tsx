import { useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, RotateCcw, FileIcon, Trash2 } from "lucide-react";
import { useFileUpload, type TrackedFile } from "@/hooks/useFileUpload";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/StatusBadge";
import { ALLOWED_EXTENSIONS, formatFileSize } from "@/constants/fileTypes";
import { STATUS_CONFIG } from "@/constants/uploadStatus";
import type { UploadStatus } from "@/constants/apiTypes";

function ProgressBar({
  progress,
  status,
}: {
  progress: number;
  status: TrackedFile["status"];
}) {
  const uploadStatus = status as UploadStatus;
  const config = STATUS_CONFIG[uploadStatus];
  const colorClass = config?.progressClass ?? "bg-zinc-500";
  const isAnimating = status === "UPLOADING" || status === "PROCESSING";

  return (
    <div className="h-1 w-full overflow-hidden rounded-full dark:bg-zinc-800 light:bg-zinc-200">
      <div
        className={`h-full rounded-full transition-all duration-300 ease-out ${colorClass} ${
          isAnimating ? "animate-progress-pulse" : ""
        }`}
        style={{ width: `${Math.max(progress, 0)}%` }}
      />
    </div>
  );
}

function FileRow({
  tracked,
  onRemove,
  onRetry,
}: {
  tracked: TrackedFile;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const isFailed = tracked.status === "FAILED";
  const isParsed = tracked.status === "PARSED";
  const isActive =
    tracked.status === "UPLOADING" ||
    tracked.status === "PROCESSING" ||
    tracked.status === "QUEUED" ||
    tracked.status === "UPLOADED";

  const eta = useMemo(() => {
    if (!tracked.speed || tracked.speed <= 0 || tracked.progress >= 100)
      return null;
    const remaining = tracked.file.size * ((100 - tracked.progress) / 100);
    const seconds = Math.ceil(remaining / tracked.speed);
    if (seconds < 60) return `${seconds}s`;
    return `${Math.ceil(seconds / 60)}m`;
  }, [tracked.speed, tracked.progress, tracked.file.size]);

  let rowStyles =
    "dark:border-zinc-800 dark:bg-zinc-900/50 light:border-zinc-200 light:bg-white";
  if (isFailed) {
    rowStyles =
      "dark:border-red-500/20 dark:bg-red-500/5 light:border-red-200 light:bg-red-50";
  } else if (isParsed) {
    rowStyles =
      "dark:border-green-500/10 dark:bg-green-500/5 light:border-green-100 light:bg-green-50";
  }

  return (
    <div
      className={`group flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors duration-150 ${rowStyles}`}
    >
      <FileIcon
        size={18}
        className={`shrink-0 ${
          isFailed
            ? "text-red-400"
            : isParsed
              ? "text-green-400"
              : "dark:text-zinc-500 light:text-zinc-400"
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="truncate font-mono text-sm dark:text-zinc-200 light:text-zinc-800"
            title={tracked.file.name}
          >
            {tracked.file.name}
          </span>
          <span className="shrink-0 text-xs dark:text-zinc-500 light:text-zinc-400">
            {formatFileSize(tracked.file.size)}
          </span>
          {eta && isActive && (
            <span className="shrink-0 font-mono text-xs dark:text-zinc-600 light:text-zinc-400">
              ~{eta}
            </span>
          )}
        </div>

        {(isActive || tracked.status === "PENDING") && (
          <div className="mt-2">
            <ProgressBar progress={tracked.progress} status={tracked.status} />
          </div>
        )}

        {tracked.error && (
          <p className="mt-1 text-xs text-red-400">{tracked.error}</p>
        )}
      </div>

      <StatusBadge status={tracked.status} />

      <div className="flex shrink-0 items-center gap-1">
        {isFailed && (
          <button
            onClick={() => onRetry(tracked.id)}
            className="rounded-full p-1.5 transition-colors duration-150
                       dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200
                       light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700"
            title="Retry upload"
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          onClick={() => onRemove(tracked.id)}
          className="rounded-full p-1.5 opacity-0 transition-all duration-150 group-hover:opacity-100
                     dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
                     light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700"
          title="Remove file"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

interface FileUploadProps {
  ingestType: string;
}

export function FileUpload({ ingestType }: FileUploadProps) {
  const { files, addAndUpload, retryFile, removeFile, clearCompleted } =
    useFileUpload();
  const { toast } = useToast();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const { rejected } = addAndUpload(acceptedFiles, ingestType);

      if (rejected.length > 0) {
        const names = rejected.map((f) => f.name).join(", ");
        toast(
          `Unsupported file type: ${names}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
          "error",
        );
      }
    },
    [addAndUpload, ingestType, toast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: files.length > 0,
    noKeyboard: files.length > 0,
  });

  const hasFiles = files.length > 0;
  const completedCount = files.filter((f) => f.status === "PARSED").length;

  if (!hasFiles) {
    return (
      <div
        {...getRootProps()}
        className={`
          flex min-h-[400px] cursor-pointer flex-col items-center justify-center
          rounded-xl border-2 border-dashed transition-all duration-200 ease-out
          ${
            isDragActive
              ? "scale-[1.01] border-blue-500 dark:bg-blue-500/5 light:bg-blue-50"
              : "dark:border-zinc-700 dark:bg-zinc-900/30 dark:hover:border-zinc-600 dark:hover:bg-zinc-900/50 light:border-zinc-300 light:bg-zinc-50 light:hover:border-zinc-400 light:hover:bg-zinc-100"
          }
        `.trim()}
      >
        <input {...getInputProps()} />
        <div
          className={`mb-4 rounded-full p-4 transition-colors duration-200 ${
            isDragActive
              ? "bg-blue-500/10 text-blue-400"
              : "dark:bg-zinc-800 dark:text-zinc-500 light:bg-zinc-200 light:text-zinc-400"
          }`}
        >
          <Upload size={32} />
        </div>
        <p className="text-base font-medium dark:text-zinc-300 light:text-zinc-700">
          {isDragActive ? "Drop files here" : "Drop files to upload"}
        </p>
        <p className="mt-1.5 text-sm dark:text-zinc-500 light:text-zinc-400">
          or click to browse
        </p>
        <p className="mt-4 font-mono text-xs dark:text-zinc-600 light:text-zinc-400">
          {ALLOWED_EXTENSIONS.join("  ·  ")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        className={`
          flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed
          px-6 py-4 transition-all duration-200
          ${
            isDragActive
              ? "border-blue-500 dark:bg-blue-500/5 light:bg-blue-50"
              : "dark:border-zinc-800 dark:bg-zinc-900/20 dark:hover:border-zinc-700 light:border-zinc-300 light:bg-zinc-50 light:hover:border-zinc-400"
          }
        `.trim()}
      >
        <input {...getInputProps()} />
        <Upload
          size={16}
          className={`mr-2 ${isDragActive ? "text-blue-400" : "dark:text-zinc-500 light:text-zinc-400"}`}
        />
        <span className="text-sm dark:text-zinc-400 light:text-zinc-500">
          {isDragActive ? "Drop more files here" : "Add more files"}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm dark:text-zinc-400 light:text-zinc-500">
          {files.length} file{files.length !== 1 ? "s" : ""}
          {completedCount > 0 && (
            <span className="text-green-500">
              {" "}
              · {completedCount} completed
            </span>
          )}
        </p>
        {completedCount > 0 && (
          <button
            onClick={clearCompleted}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs
                       transition-colors duration-150
                       dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
                       light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700"
          >
            <Trash2 size={12} />
            Clear completed
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {files.map((tracked) => (
          <FileRow
            key={tracked.id}
            tracked={tracked}
            onRemove={removeFile}
            onRetry={retryFile}
          />
        ))}
      </div>
    </div>
  );
}
