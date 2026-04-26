import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, RefreshCw } from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { IngestHistory } from "@/components/IngestHistory";
import { getDatasetTypes } from "@/services/datasets";
import { useFileUploadStore } from "@/hooks/useFileUpload";
import { isTerminalStatus } from "@/constants/uploadStatus";
import type { UploadStatus } from "@/constants/apiTypes";

function useHasActiveUploads(): boolean {
  const files = useFileUploadStore((s) => s.files);
  return files.some((f) => {
    if (f.status === "PENDING" || f.status === "UPLOADING") return true;
    const asUpload = f.status as UploadStatus;
    return !isTerminalStatus(asUpload) && f.status !== "REJECTED";
  });
}

export default function IngestPage() {
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["datasetTypes"],
    queryFn: ({ signal }) => getDatasetTypes(signal),
  });

  const types = data?.types ?? [];
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const hasActive = useHasActiveUploads();

  useEffect(() => {
    if (types.length > 0 && selectedType === null) {
      setSelectedType(types[0]!);
    }
  }, [types, selectedType]);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Ingest
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            Upload network capture files for parsing and analysis.
          </p>
        </div>

        <div className="shrink-0">
          {isLoading && (
            <div className="h-9 w-36 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
          )}

          {isError && (
            <button
              onClick={() => void refetch()}
              className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm
                         border-red-200 bg-red-50 text-red-600
                         dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400
                         hover:opacity-80 transition-opacity duration-150"
            >
              <RefreshCw size={14} />
              Retry
            </button>
          )}

          {!isLoading && !isError && types.length > 0 && (
            <div className="relative">
              <label className="absolute -top-5 left-0 text-xs text-zinc-400 dark:text-zinc-500">
                Type
              </label>
              <select
                value={selectedType ?? ""}
                onChange={(e) => setSelectedType(e.target.value)}
                disabled={hasActive}
                className={`
                  h-9 appearance-none rounded-md border pl-3 pr-8 text-sm font-medium
                  transition-colors duration-150 cursor-pointer
                  focus:outline-none focus:ring-2 focus:ring-blue-500/50
                  border-zinc-300 bg-white text-zinc-800
                  hover:border-zinc-400 shadow-sm
                  dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200
                  dark:hover:border-zinc-600
                  disabled:cursor-not-allowed disabled:opacity-50
                `}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              />
            </div>
          )}
        </div>
      </div>

      {selectedType ? (
        <FileUpload ingestType={selectedType} />
      ) : (
        !isLoading &&
        !isError && (
          <p className="py-20 text-center text-sm text-zinc-400 dark:text-zinc-500">
            No ingest types available from the server.
          </p>
        )
      )}

      <div className="mt-10 border-t border-zinc-200 dark:border-zinc-800 pt-8">
        <IngestHistory />
      </div>
    </div>
  );
}
