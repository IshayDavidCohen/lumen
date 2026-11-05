import { NavLink, Link } from "react-router-dom";
import { Sun, Moon, Settings, HelpCircle } from "lucide-react";
import { useThemeStore } from "@/hooks/useTheme";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/ingest", label: "Ingest" },
  { to: "/data", label: "Data" },
  { to: "/topology", label: "Topology" },
  { to: "/datasets", label: "Datasets" },
  { to: "/batches", label: "Batches" },
] as const;

export function NavBar({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  const { theme, toggle } = useThemeStore();

  return (
    <header
      className="
        flex h-14 items-center border-b px-6
        border-zinc-200 bg-white
        dark:border-zinc-800 dark:bg-zinc-950
      "
    >
      <NavLink
        to="/"
        className="mr-8 text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
      >
        Lumen
      </NavLink>

      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `
              relative px-3 py-1.5 text-sm font-medium
              transition-colors duration-150 rounded-md
              ${
                isActive
                  ? "text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-800/80"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800/40"
              }
            `.trim()
            }
          >
            {({ isActive }) => (
              <>
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-3 right-3 h-px bg-blue-500" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {onShowShortcuts && (
          <button
            onClick={onShowShortcuts}
            className="
              flex h-8 w-8 items-center justify-center rounded-full
              transition-colors duration-150
              text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700
              dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
            "
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (Shift+?)"
          >
            <HelpCircle size={16} />
          </button>
        )}
        <Link
          to="/settings"
          className="
            flex h-8 w-8 items-center justify-center rounded-full
            transition-colors duration-150
            text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700
            dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
          "
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={16} />
        </Link>
        <button
          onClick={toggle}
          className="
            flex h-8 w-8 items-center justify-center rounded-full
            transition-colors duration-150
            text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700
            dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
          "
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
