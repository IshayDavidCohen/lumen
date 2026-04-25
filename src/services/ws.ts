import type { JobStatusMessage } from "@/constants/apiTypes";
import { mockConnectJobStatus } from "./mock";

const WS_URL = import.meta.env.VITE_WS_URL;
const USE_MOCK = import.meta.env.VITE_MOCK === "true";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

export interface WebSocketConnection {
  close: () => void;
}

export function connectJobStatus(
  jobId: string,
  onMessage: (msg: JobStatusMessage) => void,
  onError?: (error: Event | Error) => void,
  onClose?: () => void,
): WebSocketConnection {
  if (USE_MOCK) return mockConnectJobStatus(jobId, onMessage, onError, onClose);
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function connect() {
    if (closed) return;

    ws = new WebSocket(`${WS_URL}/ws/status/${jobId}`);

    ws.addEventListener("message", (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as JobStatusMessage;
        onMessage(data);
        reconnectAttempts = 0;
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error("[ws] Failed to parse message:", err);
        }
      }
    });

    ws.addEventListener("error", (event) => {
      if (import.meta.env.DEV) {
        console.error(`[ws] Error on job ${jobId}:`, event);
      }
      onError?.(event);
    });

    ws.addEventListener("close", () => {
      if (closed) {
        onClose?.();
        return;
      }

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts);
        reconnectAttempts++;
        if (import.meta.env.DEV) {
          console.log(
            `[ws] Reconnecting job ${jobId} in ${delay}ms (attempt ${reconnectAttempts})`,
          );
        }
        reconnectTimer = setTimeout(connect, delay);
      } else {
        onError?.(new Error(`WebSocket reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`));
        onClose?.();
      }
    });
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (ws) {
        ws.close();
        ws = null;
      }
    },
  };
}
