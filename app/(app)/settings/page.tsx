import { useCallback, useEffect } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useSettingsStore } from "@/hooks/useSettings";
import { useThemeStore } from "@/hooks/useTheme";
import { useIngestHistoryStore } from "@/hooks/useIngestHistory";
import { useQueryHistoryStore } from "@/hooks/useQueryHistory";
import { useToast } from "@/components/ui/Toast";

function StatusDot({ status }: { status: "connected" | "unreachable" | "checking" }) {
  const colors = {
    connected: "bg-green-500",
    unreachable: "bg-red-500",
    checking: "bg-amber-500 animate-pulse",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}

function DangerButton({
  label,
  description,
  onConfirm,
}: {
  label: string;
  description: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger asChild>
        <button className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors
                           border-red-200 text-red-600 hover:bg-red-50
                           dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10">
          {label}
        </button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-white p-6 shadow-xl border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900">
          <AlertDialog.Title className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {label}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            {description}
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                Cancel
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                onClick={() => { onConfirm(); setOpen(false); }}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
              >
                Confirm
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
  );
}

function Separator() {
  return <hr className="border-zinc-200 dark:border-zinc-800" />;
}

export default function SettingsPage() {
  const settings = useSettingsStore();
  const themeStore = useThemeStore();
  const { toast } = useToast();

  const update = useCallback(
    (patch: Parameters<typeof settings.update>[0]) => {
      settings.update(patch);
      toast("Settings updated", "success", 2000);
    },
    [settings, toast],
  );

  useEffect(() => {
    void settings.checkHealth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Configure your Lumen workspace.</p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Connection */}
        <SectionHeader title="Connection" />
        <div className="flex flex-col gap-4">
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Backend URL</label>
            <input
              value={settings.backendUrl}
              onChange={(e) => update({ backendUrl: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm
                         border-zinc-300 bg-white text-zinc-900
                         dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">WebSocket URL</label>
            <input
              value={settings.wsUrl}
              onChange={(e) => update({ wsUrl: e.target.value })}
              className="mt-1 w-full rounded-md border px-3 py-1.5 text-sm
                         border-zinc-300 bg-white text-zinc-900
                         dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100
                         focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Mock Mode</label>
              <p className="text-[10px] text-zinc-400">When on, all API calls use mock data</p>
            </div>
            <button
              onClick={() => update({ mockMode: !settings.mockMode })}
              className={`relative h-6 w-11 rounded-full transition-colors
                ${settings.mockMode ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform
                  ${settings.mockMode ? "translate-x-5" : ""}`}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <StatusDot status={settings.connectionHealth.http} />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">HTTP</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusDot status={settings.connectionHealth.ws} />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">WS</span>
              </div>
              {settings.connectionHealth.latencyMs != null && (
                <span className="text-xs text-zinc-400">{settings.connectionHealth.latencyMs}ms</span>
              )}
            </div>
            <button
              onClick={() => void settings.checkHealth()}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium
                         text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <RefreshCw size={12} />
              Check
            </button>
          </div>
        </div>

        <Separator />

        {/* Display */}
        <SectionHeader title="Display" />
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Theme</label>
            <div className="flex rounded-md border border-zinc-300 dark:border-zinc-700">
              {(["light", "dark"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    themeStore.set(t);
                    update({ theme: t });
                  }}
                  className={`px-3 py-1 text-xs font-medium capitalize transition-colors
                    ${settings.theme === t
                      ? "bg-blue-600 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Default Page Size</label>
            <select
              value={settings.defaultPageSize}
              onChange={(e) => update({ defaultPageSize: Number(e.target.value) })}
              className="h-7 rounded-md border px-2 text-xs
                         border-zinc-300 bg-white text-zinc-700
                         dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Query Timeout (seconds)</label>
            <input
              type="number"
              min={5}
              max={300}
              value={settings.queryTimeout}
              onChange={(e) => update({ queryTimeout: Math.max(5, Number(e.target.value)) })}
              className="h-7 w-20 rounded-md border px-2 text-xs
                         border-zinc-300 bg-white text-zinc-700
                         dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            />
          </div>
        </div>

        <Separator />

        {/* Upload */}
        <SectionHeader title="Upload" />
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Max Retries</label>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.maxUploadRetries}
            onChange={(e) => update({ maxUploadRetries: Math.max(1, Math.min(10, Number(e.target.value))) })}
            className="h-7 w-20 rounded-md border px-2 text-xs
                       border-zinc-300 bg-white text-zinc-700
                       dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          />
        </div>

        <Separator />

        {/* Data Management */}
        <SectionHeader title="Data" />
        <div className="flex flex-col gap-3">
          <DangerButton
            label="Clear Ingest History"
            description="This will permanently delete all ingest history records."
            onConfirm={() => {
              useIngestHistoryStore.getState().clearAll();
              toast("Ingest history cleared", "info");
            }}
          />
          <DangerButton
            label="Clear Saved Queries"
            description="This will permanently delete all saved queries."
            onConfirm={() => {
              localStorage.removeItem("lumen-saved-queries");
              toast("Saved queries cleared", "info");
            }}
          />
          <DangerButton
            label="Clear Query History"
            description="This will permanently delete all query execution history."
            onConfirm={() => {
              useQueryHistoryStore.getState().clearAll();
              toast("Query history cleared", "info");
            }}
          />
          <DangerButton
            label="Reset All Settings"
            description="This will reset all settings to their default values. Your data will not be affected."
            onConfirm={() => {
              localStorage.removeItem("lumen-settings");
              window.location.reload();
            }}
          />
        </div>
      </div>
    </div>
  );
}
