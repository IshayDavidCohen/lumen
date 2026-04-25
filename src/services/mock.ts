import type {
  UploadResponse,
  DatasetTypesResponse,
  JobStatusMessage,
  UploadStatus,
} from "@/constants/apiTypes";
import type { WebSocketConnection } from "./ws";

const MOCK_TYPES = ["pcap", "project_b", "netflow"];

const FAIL_RATE = 0.1;

let jobCounter = 0;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function mockGetDatasetTypes(): Promise<DatasetTypesResponse> {
  await delay(400);
  return { types: MOCK_TYPES };
}

export async function mockUploadFile(
  _file: File,
  _ingestType: string,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const steps = 10;
  const stepDelay = 150;

  for (let i = 1; i <= steps; i++) {
    await delay(stepDelay);
    onProgress?.(Math.round((i / steps) * 100));
  }

  const jobId = `mock-job-${++jobCounter}-${Date.now()}`;
  return { job_id: jobId, status: "UPLOADED" };
}

export function mockConnectJobStatus(
  jobId: string,
  onMessage: (msg: JobStatusMessage) => void,
  _onError?: (error: Event | Error) => void,
  _onClose?: () => void,
): WebSocketConnection {
  let cancelled = false;
  const shouldFail = Math.random() < FAIL_RATE;

  const statuses: Array<{ status: UploadStatus; progress: number; delayMs: number }> = [
    { status: "QUEUED", progress: 0, delayMs: 600 },
    { status: "PROCESSING", progress: 20, delayMs: 800 },
    { status: "PROCESSING", progress: 50, delayMs: 700 },
    { status: "PROCESSING", progress: 80, delayMs: 600 },
  ];

  if (shouldFail) {
    statuses.push({ status: "FAILED", progress: 80, delayMs: 500 });
  } else {
    statuses.push({ status: "PARSED", progress: 100, delayMs: 500 });
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function scheduleNext(index: number) {
    if (cancelled || index >= statuses.length) return;

    const step = statuses[index]!;
    timeoutId = setTimeout(() => {
      if (cancelled) return;

      const msg: JobStatusMessage = {
        job_id: jobId,
        status: step.status,
        progress: step.progress,
        ...(step.status === "FAILED" ? { message: "Mock parse failure — simulated error" } : {}),
      };

      onMessage(msg);
      scheduleNext(index + 1);
    }, step.delayMs);
  }

  scheduleNext(0);

  return {
    close() {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
