import { useEffect, useRef } from "react";
import {
  connectJobStatus,
  type WebSocketConnection,
} from "@/services/ws";
import type { JobStatusMessage } from "@/constants/apiTypes";
import { isTerminalStatus } from "@/constants/uploadStatus";

export function useWebSocket(
  jobId: string | null,
  onMessage: (msg: JobStatusMessage) => void,
  onError?: (error: Event | Error) => void,
) {
  const connectionRef = useRef<WebSocketConnection | null>(null);
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);

  onMessageRef.current = onMessage;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!jobId) return;

    connectionRef.current = connectJobStatus(
      jobId,
      (msg) => {
        onMessageRef.current(msg);
        if (isTerminalStatus(msg.status)) {
          connectionRef.current?.close();
          connectionRef.current = null;
        }
      },
      (err) => onErrorRef.current?.(err),
    );

    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [jobId]);
}
