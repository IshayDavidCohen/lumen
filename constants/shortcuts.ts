export interface ShortcutDefinition {
  id: string;
  keys: string;
  label: string;
  description: string;
  scope: "global" | "data" | "topology";
}

export const SHORTCUTS: ShortcutDefinition[] = [
  // Global
  { id: "goto-dashboard", keys: "mod+shift+d", label: "Go to Dashboard", description: "Navigate to the dashboard", scope: "global" },
  { id: "goto-ingest", keys: "mod+shift+i", label: "Go to Ingest", description: "Navigate to file upload", scope: "global" },
  { id: "goto-data", keys: "mod+shift+e", label: "Go to Data", description: "Navigate to data viewer", scope: "global" },
  { id: "goto-topology", keys: "mod+shift+t", label: "Go to Topology", description: "Navigate to network graph", scope: "global" },
  { id: "toggle-theme", keys: "mod+shift+l", label: "Toggle Theme", description: "Switch between light and dark mode", scope: "global" },
  { id: "show-shortcuts", keys: "shift+?", label: "Show Shortcuts", description: "Open this shortcut guide", scope: "global" },

  // Data page (includes SQL editor, history, saved queries)
  { id: "execute-query", keys: "mod+enter", label: "Execute Query", description: "Run the current SQL query", scope: "data" },
  { id: "save-query", keys: "mod+s", label: "Save Query", description: "Save the current query", scope: "data" },
  { id: "toggle-history", keys: "mod+h", label: "Toggle Sidebar", description: "Show/hide the history and saved queries sidebar", scope: "data" },
  { id: "toggle-chart", keys: "mod+shift+c", label: "Toggle Chart", description: "Show/hide the chart view", scope: "data" },
  { id: "next-page", keys: "mod+right", label: "Next Page", description: "Go to the next page of results", scope: "data" },
  { id: "prev-page", keys: "mod+left", label: "Previous Page", description: "Go to the previous page of results", scope: "data" },
  { id: "export-csv", keys: "mod+shift+x", label: "Export CSV", description: "Export the current view as CSV", scope: "data" },

  // Topology page
  { id: "reset-zoom", keys: "mod+0", label: "Reset Zoom", description: "Reset the graph zoom to fit all nodes", scope: "topology" },
];

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export function formatKeyCombo(keys: string): string {
  return keys
    .split("+")
    .map((k) => {
      if (k === "mod") return IS_MAC ? "⌘" : "Ctrl";
      if (k === "shift") return IS_MAC ? "⇧" : "Shift";
      if (k === "enter") return "↵";
      if (k === "right") return "→";
      if (k === "left") return "←";
      if (k === "?") return "?";
      return k.charAt(0).toUpperCase() + k.slice(1);
    })
    .join(IS_MAC ? "" : "+");
}

export function parseKeys(keys: string): { mod: boolean; shift: boolean; key: string } {
  const parts = keys.split("+");
  return {
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    key: parts.filter((p) => p !== "mod" && p !== "shift")[0] ?? "",
  };
}
