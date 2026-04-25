import { NavLink } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useThemeStore } from "@/hooks/useTheme";

const NAV_ITEMS = [
  { to: "/ingest", label: "Ingest" },
  { to: "/data", label: "Data" },
  { to: "/query", label: "Query" },
  { to: "/datasets", label: "Datasets" },
] as const;

export function NavBar() {
  const { theme, toggle } = useThemeStore();

  return (
    <header
      className="
        flex h-14 items-center border-b px-6
        dark:border-zinc-800 dark:bg-zinc-950
        light:border-zinc-200 light:bg-white
      "
    >
      <NavLink
        to="/"
        className="mr-8 text-base font-semibold tracking-tight dark:text-zinc-100 light:text-zinc-900"
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
                  ? "dark:text-zinc-100 dark:bg-zinc-800/80 light:text-zinc-900 light:bg-zinc-100"
                  : "dark:text-zinc-500 dark:hover:text-zinc-300 dark:hover:bg-zinc-800/40 light:text-zinc-500 light:hover:text-zinc-700 light:hover:bg-zinc-100"
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

      <div className="ml-auto">
        <button
          onClick={toggle}
          className="
            flex h-8 w-8 items-center justify-center rounded-full
            transition-colors duration-150
            dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300
            light:text-zinc-400 light:hover:bg-zinc-100 light:hover:text-zinc-700
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
