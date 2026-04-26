import { useCallback, useRef } from "react";
import { create } from "zustand";
import { uploadFile } from "@/services/datasets";
import { connectJobStatus, type WebSocketConnection } from "@/services/ws";
import { isAllowedFile } from "@/constants/fileTypes";
import { isTerminalStatus } from "@/constants/uploadStatus";
import type { UploadStatus, JobStatusMessage } from "@/constants/apiTypes";
import { ApiError } from "@/services/api";
import { useIngestHistoryStore } from "./useIngestHistory";

export interface TrackedFile {
  id: string;
  file: File;
  ingestType: string;
  status: UploadStatus | "PENDING" | "UPLOADING" | "REJECTED";
  progress: number;
  jobId: string | null;
  error: string | null;
  retryCount: number;
  startedAt: number | null;
  speed: number | null;
}

interface FileUploadState {
  files: TrackedFile[];
  addFiles: (files: TrackedFile[]) => void;
  updateFile: (id: string, patch: Partial<TrackedFile>) => void;
  removeFile: (id: string) => void;
  clearCompleted: () => void;
  reset: () => void;
}

export const useFileUploadStore = create<FileUploadState>((set) => ({
  files: [],
  addFiles: (newFiles) =>
    set((state) => ({ files: [...state.files, ...newFiles] })),
  updateFile: (id, patch) =>
    set((state) => ({
      files: state.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  removeFile: (id) =>
    set((state) => ({ files: state.files.filter((f) => f.id !== id) })),
  clearCompleted: () =>
    set((state) => ({
      files: state.files.filter((f) => f.status !== "PARSED"),
    })),
  reset: () => set({ files: [] }),
}));

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

let fileCounter = 0;

export function useFileUpload() {
  const { files, addFiles, updateFile, removeFile, clearCompleted, reset } =
    useFileUploadStore();
  const wsConnections = useRef<Map<string, WebSocketConnection>>(new Map());
  const uploadControllers = useRef<Map<string, AbortController>>(new Map());

  const persistToHistory = useCallback((tracked: TrackedFile, errorMsg?: string | null) => {
    useIngestHistoryStore.getState().addEntry({
      id: tracked.id,
      filename: tracked.file.name,
      fileSize: tracked.file.size,
      ingestType: tracked.ingestType,
      jobId: tracked.jobId,
      status: tracked.status as "PARSED" | "FAILED",
      error: errorMsg ?? tracked.error,
      completedAt: Date.now(),
    });
  }, []);

  const subscribeToStatus = useCallback(
    (fileId: string, jobId: string) => {
      const existing = wsConnections.current.get(fileId);
      if (existing) existing.close();

      const connection = connectJobStatus(
        jobId,
        (msg: JobStatusMessage) => {
          updateFile(fileId, {
            status: msg.status,
            progress: msg.progress ?? (msg.status === "PARSED" ? 100 : undefined),
            error: msg.status === "FAILED" ? (msg.message ?? "Processing failed") : null,
          });

          if (isTerminalStatus(msg.status)) {
            const tracked = useFileUploadStore.getState().files.find((f) => f.id === fileId);
            if (tracked) {
              persistToHistory(
                { ...tracked, status: msg.status, jobId },
                msg.status === "FAILED" ? (msg.message ?? "Processing failed") : null,
              );
            }

            const conn = wsConnections.current.get(fileId);
            conn?.close();
            wsConnections.current.delete(fileId);
          }
        },
        (err) => {
          if (import.meta.env.DEV) {
            console.error(`[ws] Error for file ${fileId}:`, err);
          }
        },
      );

      wsConnections.current.set(fileId, connection);
    },
    [updateFile, persistToHistory],
  );

  const uploadSingleFile = useCallback(
    async (trackedFile: TrackedFile) => {
      const existingCtrl = uploadControllers.current.get(trackedFile.id);
      if (existingCtrl) existingCtrl.abort();

      const controller = new AbortController();
      uploadControllers.current.set(trackedFile.id, controller);

      updateFile(trackedFile.id, {
        status: "UPLOADING",
        progress: 0,
        startedAt: Date.now(),
        error: null,
      });

      try {
        const response = await uploadFile(
          trackedFile.file,
          trackedFile.ingestType,
          (progress) => {
            const now = Date.now();
            const elapsed = trackedFile.startedAt
              ? (now - trackedFile.startedAt) / 1000
              : 0;
            const speed =
              elapsed > 0
                ? (trackedFile.file.size * (progress / 100)) / elapsed
                : null;

            updateFile(trackedFile.id, { progress, speed });
          },
          controller.signal,
        );

        uploadControllers.current.delete(trackedFile.id);

        updateFile(trackedFile.id, {
          status: response.status,
          jobId: response.job_id,
          progress: 100,
        });

        subscribeToStatus(trackedFile.id, response.job_id);
      } catch (err) {
        uploadControllers.current.delete(trackedFile.id);

        if (err instanceof ApiError && err.message === "Request was cancelled") {
          return;
        }

        const message =
          err instanceof ApiError ? err.message : "Upload failed";

        if (import.meta.env.DEV) {
          console.error(`Upload error for ${trackedFile.file.name}:`, err);
        }

        if (trackedFile.retryCount < MAX_RETRIES) {
          const delay =
            RETRY_BASE_DELAY * Math.pow(2, trackedFile.retryCount);
          updateFile(trackedFile.id, {
            retryCount: trackedFile.retryCount + 1,
            error: `Retrying in ${delay / 1000}s...`,
          });

          setTimeout(() => {
            const currentFiles = useFileUploadStore.getState().files;
            const current = currentFiles.find((f) => f.id === trackedFile.id);
            if (current) {
              void uploadSingleFile(current);
            }
          }, delay);
        } else {
          updateFile(trackedFile.id, {
            status: "FAILED",
            error: message,
            progress: 0,
          });
          persistToHistory({ ...trackedFile, status: "FAILED" }, message);
        }
      }
    },
    [updateFile, subscribeToStatus, persistToHistory],
  );

  const addAndUpload = useCallback(
    (rawFiles: File[], ingestType: string) => {
      const rejected: File[] = [];
      const accepted: TrackedFile[] = [];

      for (const file of rawFiles) {
        if (!isAllowedFile(file)) {
          rejected.push(file);
          continue;
        }

        const tracked: TrackedFile = {
          id: `file-${++fileCounter}-${Date.now()}`,
          file,
          ingestType,
          status: "PENDING",
          progress: 0,
          jobId: null,
          error: null,
          retryCount: 0,
          startedAt: null,
          speed: null,
        };
        accepted.push(tracked);
      }

      if (accepted.length > 0) {
        addFiles(accepted);
        for (const file of accepted) {
          void uploadSingleFile(file);
        }
      }

      return { accepted, rejected };
    },
    [addFiles, uploadSingleFile],
  );

  const retryFile = useCallback(
    (fileId: string) => {
      const file = files.find((f) => f.id === fileId);
      if (!file || file.status !== "FAILED") return;

      const existingCtrl = uploadControllers.current.get(fileId);
      if (existingCtrl) {
        existingCtrl.abort();
        uploadControllers.current.delete(fileId);
      }

      updateFile(fileId, {
        status: "PENDING",
        progress: 0,
        error: null,
        retryCount: 0,
        startedAt: null,
        speed: null,
      });

      const updated = useFileUploadStore.getState().files.find((f) => f.id === fileId);
      if (updated) {
        void uploadSingleFile(updated);
      }
    },
    [files, updateFile, uploadSingleFile],
  );

  const removeTrackedFile = useCallback(
    (fileId: string) => {
      const ctrl = uploadControllers.current.get(fileId);
      if (ctrl) {
        ctrl.abort();
        uploadControllers.current.delete(fileId);
      }
      const conn = wsConnections.current.get(fileId);
      if (conn) {
        conn.close();
        wsConnections.current.delete(fileId);
      }
      removeFile(fileId);
    },
    [removeFile],
  );

  return {
    files,
    addAndUpload,
    retryFile,
    removeFile: removeTrackedFile,
    clearCompleted,
    reset,
  };
}
