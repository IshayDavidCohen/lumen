import { Outlet } from "react-router-dom";
import { NavBar } from "./NavBar";
import { ToastProvider } from "./ui/Toast";

export function AppShell() {
  return (
    <ToastProvider>
      <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
        <NavBar />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
