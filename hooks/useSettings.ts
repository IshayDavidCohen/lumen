import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings, ConnectionHealth } from "@/constants/apiTypes";
import {
  getSettings,
  updateSettings,
  checkConnectionHealth,
} from "@/services/settings";

interface SettingsState extends AppSettings {
  connectionHealth: ConnectionHealth;
  update: (patch: Partial<AppSettings>) => void;
  checkHealth: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => {
      const initial = getSettings();
      return {
        ...initial,
        connectionHealth: {
          http: "checking" as const,
          ws: "checking" as const,
        },
        update: (patch) => {
          updateSettings(patch);
          set(patch);
        },
        checkHealth: async () => {
          set((s) => ({
            connectionHealth: { ...s.connectionHealth, http: "checking" as const, ws: "checking" as const },
          }));
          const result = await checkConnectionHealth();
          set({ connectionHealth: result });
        },
      };
    },
    {
      name: "lumen-settings",
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        wsUrl: state.wsUrl,
        mockMode: state.mockMode,
        theme: state.theme,
        defaultPageSize: state.defaultPageSize,
        maxUploadRetries: state.maxUploadRetries,
        queryTimeout: state.queryTimeout,
      }),
    },
  ),
);
