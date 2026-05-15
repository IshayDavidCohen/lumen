import type { AppSettings, ConnectionHealth } from "@/constants/apiTypes";

const STORAGE_KEY = "lumen-settings";

function getDefaults(): AppSettings {
  return {
    backendUrl: import.meta.env.VITE_BASE_URL ?? "http://localhost:8000",
    wsUrl: import.meta.env.VITE_WS_URL ?? "ws://localhost:8000",
    mockMode: import.meta.env.VITE_MOCK === "true",
    theme: (localStorage.getItem("lumen-theme") as "light" | "dark") ?? "light",
    defaultPageSize: 50,
    maxUploadRetries: 3,
    queryTimeout: 30,
  };
}

export function getSettings(): AppSettings {
  const defaults = getDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Partial<AppSettings>;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

export function updateSettings(patch: Partial<AppSettings>): void {
  const current = getSettings();
  const updated = { ...current, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export async function checkConnectionHealth(
  signal?: AbortSignal,
): Promise<ConnectionHealth> {
  const settings = getSettings();

  if (settings.mockMode) {
    return {
      http: "connected",
      ws: "connected",
      latencyMs: 1,
      checkedAt: Date.now(),
    };
  }

  const result: ConnectionHealth = {
    http: "checking",
    ws: "checking",
    checkedAt: Date.now(),
  };

  // HTTP check
  try {
    const start = performance.now();
    const response = await fetch(`${settings.backendUrl}/health`, {
      signal: signal ?? AbortSignal.timeout(5000),
    });
    const latency = Math.round(performance.now() - start);
    result.http = response.ok ? "connected" : "unreachable";
    result.latencyMs = latency;
  } catch {
    result.http = "unreachable";
  }

  // WS check
  try {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${settings.wsUrl}/ws/health`);
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("timeout"));
      }, 5000);
      ws.onopen = () => {
        clearTimeout(timeout);
        ws.close();
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("ws error"));
      };
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          ws.close();
          reject(new Error("aborted"));
        });
      }
    });
    result.ws = "connected";
  } catch {
    result.ws = "unreachable";
  }

  return result;
}
