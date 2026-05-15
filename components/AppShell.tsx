import { useState, useMemo } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { NavBar } from "./NavBar";
import { ToastProvider } from "./ui/Toast";
import { ShortcutGuide } from "./ShortcutGuide";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useThemeStore } from "@/hooks/useTheme";

export function AppShell() {
  const navigate = useNavigate();
  const [showShortcutGuide, setShowShortcutGuide] = useState(false);

  const handlers = useMemo(
    () => ({
      "goto-dashboard": () => navigate("/"),
      "goto-ingest": () => navigate("/ingest"),
      "goto-data": () => navigate("/data"),
      "goto-topology": () => navigate("/topology"),
      "toggle-theme": () => useThemeStore.getState().toggle(),
      "show-shortcuts": () => setShowShortcutGuide((s) => !s),
    }),
    [navigate],
  );

  useKeyboardShortcuts("global", handlers);

  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        <NavBar onShowShortcuts={() => setShowShortcutGuide(true)} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <ShortcutGuide open={showShortcutGuide} onOpenChange={setShowShortcutGuide} />
    </ToastProvider>
  );
}
