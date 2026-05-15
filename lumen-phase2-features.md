# Lumen Phase 2 — Feature Development Guide

> Cursor prompt: implement all 8 features described below. Read this entire document before starting. Follow the architecture rules, file placement conventions, and mock data requirements exactly. Build features in the order listed — later features depend on earlier ones.

---

## Global Rules (apply to every file you create or modify)

### Architecture

- **All UI components** use Radix UI primitives with custom Tailwind styling. Do not introduce shadcn/ui, Headless UI, or other component libraries.
- **API calls** go through `services/` — never call fetch or axios directly from a component or hook.
- **TypeScript strict mode** — no `any` types without an explicit `// eslint-disable-next-line` comment explaining why. The project uses `"strict": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`, `"noUncheckedIndexedAccess": true`.
- **State management** uses Zustand stores (see existing stores in `hooks/`). Use `zustand/middleware` `persist` for anything that should survive page reload (settings, saved queries, shortcuts config).
- **Server state** uses TanStack Query (`@tanstack/react-query`). All service functions accept an optional `signal?: AbortSignal`.
- **Routing** uses `react-router-dom` v7. New pages go under `app/(app)/`. Register new routes in `App.tsx`.
- **Styling** — Tailwind CSS v4 via `@tailwindcss/vite`. Dark mode uses the `dark:` variant with the class strategy (already configured). All new UI must support both light and dark themes.
- **Icons** use `lucide-react` — it's already a dependency. Do not add another icon library.
- **Fonts** — Geist is bundled and active. Do not add new fonts.

### File Placement

```
app/(app)/dashboard/page.tsx    ← new page
app/(app)/settings/page.tsx     ← new page
components/Chart.tsx             ← new component
components/NetworkGraph.tsx      ← new component
components/ColumnProfile.tsx     ← new component
components/ShortcutGuide.tsx     ← new component
services/queries.ts              ← new service
services/settings.ts             ← new service
services/columnProfile.ts        ← new service
hooks/useSavedQueries.ts         ← new hook
hooks/useSettings.ts             ← new hook
hooks/useKeyboardShortcuts.ts    ← new hook
constants/shortcuts.ts           ← new constants
constants/chartTypes.ts          ← new constants
```

### Mock Data

The backend does not exist yet. Every new service function **must** check `VITE_MOCK` and return realistic mock data when true, following the same pattern as `services/mock.ts`. Mock functions live in `services/mock.ts` (append to the existing file). Mock data must:

- Include realistic delays (`await delay(200–600)`)
- Return typed responses matching interfaces in `constants/apiTypes.ts`
- Cover edge cases (empty states, error states at a ~10% rate consistent with `FAIL_RATE`)
- Use the existing mock data generators and table schemas for consistency (same IPs, hostnames, protocols as the existing mock data)

### New Types

Add all new interfaces and types to `constants/apiTypes.ts` unless they are purely component-internal. Keep the file organized with section comments like the existing ones.

---

## Feature 1: Dashboard / Overview Page

### Goal

Replace the current `Navigate to="/ingest"` default route with a dashboard that gives returning users an at-a-glance summary of their data.

### Route

- Path: `/` (index route, replaces the current `Navigate`)
- Also accessible via `/dashboard`
- Add "Dashboard" as the **first** item in `NavBar.tsx`'s `NAV_ITEMS` array

### Page: `app/(app)/dashboard/page.tsx`

#### Layout

Full-width, max-w-6xl centered, with these sections top-to-bottom:

**1. Summary stat cards (top row, 4 cards in a grid)**

| Card | Value | Icon | Description |
|---|---|---|---|
| Dataset Types | count of dataset types | `Database` | "Active dataset types" |
| Total Tables | sum of tables across all types | `Table2` | "Parsed tables" |
| Total Rows | formatted (e.g., "2.4M") | `Rows3` | "Across all datasets" |
| Recent Ingests | count in last 24h from ingest history | `Upload` | "Last 24 hours" |

Each card: rounded-lg border, subtle bg, large number, small label beneath. Dark mode compatible.

**2. Recent ingestion activity (left 2/3)**

- A compact table showing the last 10 entries from `useIngestHistoryStore`
- Columns: filename (truncated, mono font), type, status (use `StatusBadge`), time ago
- Clicking a row navigates to `/data/{type}`
- Empty state: "No recent ingestions. Upload files on the Ingest page." with a link to `/ingest`

**3. Quick actions (right 1/3, sidebar card)**

- "Upload Files" → navigates to `/ingest`
- "Run Query" → navigates to `/query`
- "Browse Datasets" → navigates to `/datasets`
- Each is a button-like link with an icon, compact vertical stack

**4. Dataset overview cards (bottom section)**

- One card per dataset type, similar to the `DatasetsPage` cards but condensed
- Show: type name, table count, total row count
- Clicking navigates to `/datasets` (or `/data/{type}`)

### Data Sources

- `getDatasetTypes()` + `getTables()` per type via TanStack Query (reuse existing queries)
- `useIngestHistoryStore` for recent activity (already persisted in localStorage)
- No new API endpoints needed — this page composes existing data

### Mock Behavior

Uses existing mocks. No new mock functions needed for this page specifically.

---

## Feature 2: Visualization Layer

### Goal

Allow users to chart query results and table data. The chart component must be generic — it receives data and a config, not hardcoded to any schema.

### Install Dependency

```bash
npm install recharts
```

Recharts is already listed in the project's available libraries. Use it as the sole charting library.

### Types — add to `constants/apiTypes.ts`

```typescript
// ── Chart types ───────────────────────────────────────────────

export type ChartType = "bar" | "line" | "scatter" | "histogram";

export interface ChartConfig {
  id: string;
  name: string;
  type: ChartType;
  xColumn: string;
  yColumn: string;
  groupByColumn?: string;
  colorColumn?: string;
  binCount?: number; // for histogram
  createdAt: number;
  datasetType?: string;
  tableName?: string;
}
```

### Constants: `constants/chartTypes.ts`

```typescript
export const CHART_TYPE_OPTIONS: Array<{
  value: ChartType;
  label: string;
  description: string;
  icon: string; // lucide icon name
}> = [
  { value: "bar", label: "Bar", description: "Compare categories", icon: "BarChart3" },
  { value: "line", label: "Line", description: "Trends over time", icon: "TrendingUp" },
  { value: "scatter", label: "Scatter", description: "Correlations", icon: "ScatterChart" },
  { value: "histogram", label: "Histogram", description: "Distributions", icon: "BarChart" },
];
```

### Component: `components/Chart.tsx`

**Props:**

```typescript
interface ChartProps {
  columns: Column[];
  rows: Record<string, unknown>[];
  config: ChartConfig;
  height?: number; // default 400
  className?: string;
}
```

**Behavior:**

- Renders the appropriate Recharts component based on `config.type`
- **Bar chart**: `<BarChart>` with `<Bar>` for `yColumn`, `<XAxis>` for `xColumn`. If `groupByColumn` is set, render grouped/stacked bars.
- **Line chart**: `<LineChart>` with `<Line>` for `yColumn`, `<XAxis>` for `xColumn`. Multiple lines if `groupByColumn` is set.
- **Scatter chart**: `<ScatterChart>` with `<Scatter>`, x = `xColumn`, y = `yColumn`. Color by `colorColumn` if set.
- **Histogram**: Compute bins client-side from `xColumn` values. Use `<BarChart>` with computed frequency bins. `binCount` defaults to 20.
- Responsive via `<ResponsiveContainer width="100%" height={height}>`
- Use Tailwind-compatible colors: blue-500, teal-500, amber-500, rose-500 for series. Respect dark mode with `fill` and `stroke` adapted accordingly.
- Tooltip and legend included by default.
- Handle edge cases: empty data shows "No data to visualize" message, non-numeric columns on Y axis show a warning.

### Chart Configuration Panel: `components/ChartConfigPanel.tsx`

A form panel (collapsible, placed above the chart) where the user picks:

- **Chart type** — radio group or segmented control using the 4 options
- **X axis column** — dropdown from available `columns`, filtered: for line charts prefer date columns, for histogram prefer number columns
- **Y axis column** — dropdown, filtered to numeric columns for bar/line/scatter. Hidden for histogram (histogram only uses X).
- **Group by** (optional) — dropdown, filtered to string columns with low cardinality (< 20 unique values in the visible data)
- **Bin count** — number input, only shown for histogram type, default 20

Use Radix `Select` or `DropdownMenu` for dropdowns. All form state is local to the panel; it emits the full `ChartConfig` via an `onChange` callback.

### Integration Points

**Query page (`app/(app)/query/page.tsx`):**

- Add a "Chart" toggle button next to the existing results area (icon: `BarChart3`)
- When toggled on, show `ChartConfigPanel` + `Chart` below the query results table
- The chart uses the same `results.columns` and `results.rows` data
- Default config: first numeric column as Y, first string or date column as X, bar chart

**Data page (`app/(app)/data/page.tsx`):**

- Add the same "Chart" toggle in the toolbar above `DataTable`
- Uses the current table's data (the page already fetches `tableData`)

### Saved Chart Configs

For now, chart configs are ephemeral (reset on page navigation). The `ChartConfig` type includes an `id` and `createdAt` for future persistence — but do NOT implement save/load yet. That comes with saved queries in Feature 3.

---

## Feature 3: Saved Queries with Service Abstraction

### Goal

Let users name, save, organize, and recall SQL queries. Storage is localStorage for now, but the service layer must abstract this so swapping to a REST API later is a one-file change.

### Service: `services/queries.ts`

```typescript
export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  description?: string;
  tags: string[];
  datasetType?: string;
  chartConfig?: ChartConfig; // from Feature 2
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastRunRowCount?: number;
  lastRunDurationMs?: number;
}

export interface SavedQueryListResponse {
  queries: SavedQuery[];
  total: number;
}

// Service interface — all functions go through this
export async function listSavedQueries(signal?: AbortSignal): Promise<SavedQueryListResponse>;
export async function getSavedQuery(id: string, signal?: AbortSignal): Promise<SavedQuery>;
export async function createSavedQuery(query: Omit<SavedQuery, "id" | "createdAt" | "updatedAt">): Promise<SavedQuery>;
export async function updateSavedQuery(id: string, patch: Partial<SavedQuery>): Promise<SavedQuery>;
export async function deleteSavedQuery(id: string): Promise<void>;
```

**Implementation:** When `VITE_MOCK` is true OR as the default (since there's no backend endpoint for this yet), all functions read/write to localStorage under the key `lumen-saved-queries`. Use a Zustand store internally if preferred, but the exported API must be async (returns Promises) so it's swap-ready for REST calls.

Generate UUIDs for IDs using `crypto.randomUUID()`.

### Hook: `hooks/useSavedQueries.ts`

A TanStack Query wrapper around the service:

```typescript
export function useSavedQueries();        // useQuery wrapping listSavedQueries
export function useSavedQuery(id: string); // useQuery wrapping getSavedQuery
export function useSaveQuery();            // useMutation wrapping createSavedQuery
export function useUpdateQuery();          // useMutation wrapping updateSavedQuery
export function useDeleteQuery();          // useMutation wrapping deleteSavedQuery
```

Each mutation invalidates the `["savedQueries"]` query key on success.

### UI Changes to Query Page (`app/(app)/query/page.tsx`)

**Save button** — in the editor toolbar area, add a "Save" button (icon: `Save` from lucide). Clicking opens a Radix `Dialog` with:

- Name (required text input)
- Description (optional textarea)
- Tags (comma-separated text input, parsed into string array)
- If a chart config is active, checkbox: "Save chart configuration"
- Save / Cancel buttons

**Saved queries sidebar** — replace or augment the existing History sidebar:

- Add a tab switcher at the top: "History" | "Saved"
- **History tab**: existing behavior, unchanged
- **Saved tab**: list of saved queries, sorted by `updatedAt` desc
  - Each entry shows: name, truncated SQL preview (first 60 chars, mono font), tags as small pills, last run info if available
  - Click to load SQL into the editor (and chart config if saved)
  - Hover shows: edit (pencil icon) and delete (trash icon) buttons
  - Edit opens the same save dialog, pre-populated
  - Delete shows a confirmation via Radix `AlertDialog`

**Auto-update on run** — when a saved query is loaded and executed, update its `lastRunAt`, `lastRunRowCount`, `lastRunDurationMs` via `useUpdateQuery`.

### Mock Data

Add 3–5 pre-seeded saved queries in the mock layer covering different query types:

```typescript
// Example seeds
{ name: "All HTTP traffic", sql: "SELECT * FROM http_requests ORDER BY timestamp DESC LIMIT 100", tags: ["http", "overview"] },
{ name: "Top talkers", sql: "SELECT src_ip, COUNT(*) as count FROM packets GROUP BY src_ip ORDER BY count DESC LIMIT 20", tags: ["network", "top-n"] },
{ name: "DNS anomalies", sql: "SELECT * FROM dns_queries WHERE query_type NOT IN ('A','AAAA','CNAME') ORDER BY timestamp DESC", tags: ["dns", "anomaly"] },
{ name: "Flow volume by hour", sql: "SELECT DATE_TRUNC('hour', start_time) as hour, SUM(bytes) as total_bytes FROM flows GROUP BY hour ORDER BY hour", tags: ["netflow", "timeseries"] },
```

Seed these into localStorage on first load (check if the key exists; if not, write the seeds).

---

## Feature 4: Dynamic Column Profiling

### Goal

On-demand statistical profiling for any column the user selects. The profiling must be dynamic — it computes stats from whatever data is present, not hardcoded to any schema.

### Types — add to `constants/apiTypes.ts`

```typescript
// ── Column profiling ──────────────────────────────────────────

export interface ColumnProfileNumeric {
  kind: "numeric";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  histogram: Array<{ binStart: number; binEnd: number; count: number }>;
}

export interface ColumnProfileString {
  kind: "string";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  uniqueCount: number;
  topValues: Array<{ value: string; count: number; pct: number }>;
  minLength: number;
  maxLength: number;
  avgLength: number;
}

export interface ColumnProfileDate {
  kind: "date";
  column: string;
  count: number;
  nullCount: number;
  nullPct: number;
  min: string; // ISO date string
  max: string;
  timespan: string; // human-readable, e.g. "14 days"
  histogram: Array<{ bucket: string; count: number }>; // time buckets
}

export type ColumnProfile = ColumnProfileNumeric | ColumnProfileString | ColumnProfileDate;

export interface ColumnProfileRequest {
  datasetType: string;
  tableName: string;
  columnName: string;
  sampleSize?: number; // default 10000
}

export interface ColumnProfileResponse {
  profile: ColumnProfile;
  sampledRows: number;
  totalRows: number;
}
```

### Service: `services/columnProfile.ts`

```typescript
export async function getColumnProfile(
  params: ColumnProfileRequest,
  signal?: AbortSignal,
): Promise<ColumnProfileResponse>;
```

When `VITE_MOCK` is true, compute the profile client-side from the mock data generators. This means:

- Generate `sampleSize` rows using the existing `ROW_GENERATORS` from `services/mock.ts`
- Compute actual statistics from the generated data
- Return the appropriate profile type based on the column's `type` field

This makes the mock profiler genuinely useful for testing the UI since the numbers will be real (computed from the mock data), not hardcoded.

### Component: `components/ColumnProfile.tsx`

A panel/drawer that shows the profile for a selected column. Triggered from the DataTable.

**Layout (inside a Radix `Dialog` or a slide-over panel):**

- **Header**: column name, type badge, "Profiling {n} of {total} rows" subtitle
- **Summary stats**: key-value pairs in a compact grid
  - Numeric: count, nulls, min, max, mean, median, std dev, p25, p75
  - String: count, nulls, unique count, min/max/avg length
  - Date: count, nulls, min date, max date, timespan
- **Visualization**:
  - Numeric: histogram using the `Chart` component from Feature 2 (histogram type)
  - String: horizontal bar chart of top 10 values using `Chart` component (bar type)
  - Date: time-bucket bar chart using `Chart` component (bar type)
- Loading state: skeleton placeholders while profile is being computed

### Integration with DataTable

In `components/DataTable.tsx`, add to each column header:

- A small icon button (lucide `BarChart2`, 12px) that appears on hover
- Clicking it opens the `ColumnProfile` dialog for that column
- Pass the current dataset type, table name, and column name from the page context

To pass dataset context into DataTable, add optional props:

```typescript
interface DataTableProps {
  // ... existing props
  datasetType?: string;
  tableName?: string;
}
```

Update the Data page to pass these props through.

---

## Feature 5: Network Topology Graph

### Goal

Visualize network communication patterns as a node-link diagram. The user picks which columns represent source and target nodes, and optionally a metric column for edge weight. This keeps it dynamic and schema-agnostic.

### Install Dependency

```bash
npm install d3-force d3-selection
npm install -D @types/d3-force @types/d3-selection
```

Use d3-force for the layout engine and render with SVG directly (not a full d3 bindng — use React for the DOM, d3 only for the force simulation math).

### Types — add to `constants/apiTypes.ts`

```typescript
// ── Network topology ──────────────────────────────────────────

export interface TopologyNode {
  id: string;
  label: string;
  connections: number;
  totalMetric: number;
}

export interface TopologyEdge {
  source: string;
  target: string;
  weight: number;
}

export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TopologyConfig {
  sourceColumn: string;
  targetColumn: string;
  metricColumn?: string; // optional, used for edge weight / node size
  limit?: number; // max nodes to show, default 50
}
```

### Component: `components/NetworkGraph.tsx`

**Props:**

```typescript
interface NetworkGraphProps {
  data: TopologyData;
  config: TopologyConfig;
  width?: number;
  height?: number; // default 600
  className?: string;
}
```

**Behavior:**

- d3-force simulation with `forceLink`, `forceManyBody`, `forceCenter`, `forceCollide`
- **Nodes**: circles, sized proportionally to `totalMetric` (or `connections` if no metric). Min radius 8, max 40. Labelled with the node ID (IP address, hostname, etc).
- **Edges**: lines between nodes, stroke-width proportional to `weight`. Use opacity 0.3–0.7 based on weight.
- **Colors**: nodes colored by degree (number of connections). Use a gradient from blue-400 (few connections) to rose-500 (many connections).
- **Interactivity**:
  - Hover a node: highlight it and all its edges, dim others. Show a tooltip with: node ID, connection count, total metric value.
  - Hover an edge: highlight it, show tooltip with source, target, weight.
  - Click a node: pin/unpin it in the simulation.
  - Drag nodes to reposition.
  - Scroll to zoom, drag background to pan.
- **Legend**: bottom-left, showing the color scale and size scale.
- Dark mode: adjust colors, use lighter node labels, darker background.

### Configuration Panel: `components/TopologyConfigPanel.tsx`

A form panel (similar to `ChartConfigPanel`) where the user picks:

- **Source column** — dropdown, filtered to string columns
- **Target column** — dropdown, filtered to string columns
- **Metric column** (optional) — dropdown, filtered to numeric columns. Label: "Edge weight / node size"
- **Max nodes** — number input, default 50, range 10–200

### Data Aggregation Logic

The topology component receives raw row data and aggregates it:

1. Group rows by unique `(source, target)` pairs
2. Sum the metric column for each pair (or count rows if no metric column)
3. Build node list from unique source + target values
4. For each node: `connections` = number of unique peers, `totalMetric` = sum of all edge weights touching this node
5. If node count exceeds `limit`, keep only the top N nodes by `totalMetric` (or `connections`), and drop edges to/from excluded nodes

Put this aggregation logic in a pure utility function: `lib/topologyUtils.ts`

### New Page: `app/(app)/topology/page.tsx`

A dedicated page for the topology view (not embedded in the data page — it needs full screen space).

- **Route**: `/topology` — add to `App.tsx` and `NavBar.tsx` (after "Query")
- **Layout**:
  - Top bar: dataset type selector + table selector (reuse the pattern from the Data page) + the `TopologyConfigPanel` as a collapsible section
  - Main area: `NetworkGraph` filling the remaining viewport height
  - Bottom bar: stats — "{n} nodes, {m} edges, showing top {limit}"
- The page fetches table data via `getTableData` with a larger page size (up to 5000 rows) to have enough data for meaningful aggregation

### Mock Behavior

Uses existing mock data. For the `pcap` → `packets` table, a natural mapping is `src_ip` → `dst_ip` with `length` as the metric. The mock data generators already produce these fields, so the topology will show realistic IP-to-IP communication patterns.

For the `netflow` → `flows` table: `src_ip` → `dst_ip` with `bytes` as metric.

No new mock functions needed — the page uses `getTableData` which is already mocked.

---

## Feature 6: Settings Page

### Goal

Surface all configurable options in a proper settings UI instead of requiring env var changes or localStorage manipulation.

### Types — add to `constants/apiTypes.ts`

```typescript
// ── Settings ──────────────────────────────────────────────────

export interface AppSettings {
  backendUrl: string;
  wsUrl: string;
  mockMode: boolean;
  theme: "light" | "dark";
  defaultPageSize: number;
  maxUploadRetries: number;
  queryTimeout: number; // seconds
}

export interface ConnectionHealth {
  http: "connected" | "unreachable" | "checking";
  ws: "connected" | "unreachable" | "checking";
  latencyMs?: number;
  checkedAt?: number;
}
```

### Service: `services/settings.ts`

```typescript
export function getSettings(): AppSettings;
export function updateSettings(patch: Partial<AppSettings>): void;
export async function checkConnectionHealth(signal?: AbortSignal): Promise<ConnectionHealth>;
```

- `getSettings` reads from localStorage (`lumen-settings`), falling back to env vars for defaults
- `updateSettings` writes to localStorage and triggers a page-level state update
- `checkConnectionHealth`:
  - HTTP: tries `GET {backendUrl}/health` with a 5s timeout. If mock mode, always return "connected".
  - WS: tries opening a WebSocket to `{wsUrl}/ws/health` with a 5s timeout. If mock mode, always return "connected".
  - Returns latency in ms for the HTTP check.

### Hook: `hooks/useSettings.ts`

Zustand store with `persist` middleware:

```typescript
interface SettingsState extends AppSettings {
  connectionHealth: ConnectionHealth;
  update: (patch: Partial<AppSettings>) => void;
  checkHealth: () => Promise<void>;
}
```

The store initializes from `getSettings()`. When `update` is called, it also calls `updateSettings` to persist.

**Important**: the existing `useThemeStore` should be updated to read its initial value from the settings store rather than directly from localStorage. The settings page becomes the single source of truth for theme preference.

### Page: `app/(app)/settings/page.tsx`

**Route**: `/settings` — add to `App.tsx`. In NavBar, add a gear icon button (lucide `Settings`) in the right side of the header (next to the existing theme toggle), linking to `/settings`. Do NOT add "Settings" to the main nav items array — it's an icon button.

**Layout** — max-w-2xl centered, organized into sections with Radix `Separator` between them:

**Section 1: Connection**

| Field | Input Type | Notes |
|---|---|---|
| Backend URL | Text input | Prefilled from `VITE_BASE_URL` or stored value |
| WebSocket URL | Text input | Prefilled from `VITE_WS_URL` or stored value |
| Mock Mode | Toggle switch | When on, all API calls use mock data |
| Connection Status | Read-only indicator | Shows HTTP and WS status with colored dot (green/red/yellow). "Check" button to re-test. Shows latency if connected. |

**Section 2: Display**

| Field | Input Type | Notes |
|---|---|---|
| Theme | Segmented control: Light / Dark | Syncs with existing theme system |
| Default Page Size | Select: 25, 50, 100, 200 | Used by DataTable default |
| Query Timeout | Number input (seconds) | Default 30 |

**Section 3: Upload**

| Field | Input Type | Notes |
|---|---|---|
| Max Retries | Number input | Default 3, range 1–10 |

**Section 4: Data**

- "Clear Ingest History" button (with confirmation dialog) — calls `useIngestHistoryStore.getState().clearAll()`
- "Clear Saved Queries" button (with confirmation dialog) — clears the saved queries localStorage key
- "Clear Query History" button (with confirmation dialog) — calls `useQueryHistoryStore.getState().clearAll()`
- "Reset All Settings" button (danger style, with confirmation dialog) — resets to defaults

Each button shows what will be deleted and is styled as a destructive action (red text, confirmation dialog via Radix `AlertDialog`).

**Save behavior**: settings auto-save on change (no explicit "Save" button). Show a brief toast confirmation: "Settings updated".

### Integration

After implementing the settings store:

- Update `services/api.ts` to read `backendUrl` from the settings store instead of `import.meta.env.VITE_BASE_URL`
- Update `services/ws.ts` to read `wsUrl` from the settings store instead of `import.meta.env.VITE_WS_URL`
- Update `services/mock.ts` usage: check `getSettings().mockMode` instead of `import.meta.env.VITE_MOCK === "true"` (keep env var as fallback for initial load)
- Update the `MAX_RETRIES` constant in `hooks/useFileUpload.ts` to read from settings
- Update `DataTable` default page size to read from settings

---

## Feature 7: Keyboard Shortcuts

### Goal

Power-user keyboard shortcuts across the app, with a discoverable shortcut guide.

### Constants: `constants/shortcuts.ts`

Define all shortcuts in one place:

```typescript
export interface ShortcutDefinition {
  id: string;
  keys: string; // e.g., "mod+enter", "mod+s", "mod+k"
  label: string;
  description: string;
  scope: "global" | "query" | "data" | "topology";
}

export const SHORTCUTS: ShortcutDefinition[] = [
  // Global
  { id: "goto-dashboard", keys: "mod+shift+d", label: "Go to Dashboard", description: "Navigate to the dashboard", scope: "global" },
  { id: "goto-ingest", keys: "mod+shift+i", label: "Go to Ingest", description: "Navigate to file upload", scope: "global" },
  { id: "goto-query", keys: "mod+shift+q", label: "Go to Query", description: "Navigate to the SQL editor", scope: "global" },
  { id: "goto-data", keys: "mod+shift+e", label: "Go to Data", description: "Navigate to data viewer", scope: "global" },
  { id: "goto-topology", keys: "mod+shift+t", label: "Go to Topology", description: "Navigate to network graph", scope: "global" },
  { id: "toggle-theme", keys: "mod+shift+l", label: "Toggle Theme", description: "Switch between light and dark mode", scope: "global" },
  { id: "show-shortcuts", keys: "shift+?", label: "Show Shortcuts", description: "Open this shortcut guide", scope: "global" },

  // Query page
  { id: "execute-query", keys: "mod+enter", label: "Execute Query", description: "Run the current SQL query", scope: "query" },
  { id: "save-query", keys: "mod+s", label: "Save Query", description: "Save the current query", scope: "query" },
  { id: "toggle-history", keys: "mod+h", label: "Toggle Sidebar", description: "Show/hide the history and saved queries sidebar", scope: "query" },
  { id: "toggle-chart", keys: "mod+shift+c", label: "Toggle Chart", description: "Show/hide the chart view", scope: "query" },

  // Data page
  { id: "next-page", keys: "mod+right", label: "Next Page", description: "Go to the next page of results", scope: "data" },
  { id: "prev-page", keys: "mod+left", label: "Previous Page", description: "Go to the previous page of results", scope: "data" },
  { id: "export-csv", keys: "mod+shift+x", label: "Export CSV", description: "Export the current view as CSV", scope: "data" },

  // Topology page
  { id: "reset-zoom", keys: "mod+0", label: "Reset Zoom", description: "Reset the graph zoom to fit all nodes", scope: "topology" },
  { id: "toggle-labels", keys: "mod+shift+l", label: "Toggle Labels", description: "Show/hide node labels", scope: "topology" },
];
```

`mod` = `Cmd` on Mac, `Ctrl` on Windows/Linux. Detect platform via `navigator.platform`.

### Hook: `hooks/useKeyboardShortcuts.ts`

```typescript
export function useKeyboardShortcuts(
  scope: ShortcutDefinition["scope"],
  handlers: Record<string, () => void>,
): void;
```

- Registers a `keydown` listener on `document`
- Matches incoming key events against shortcuts in the given scope + global scope
- Calls the matching handler
- Prevents default browser behavior for matched shortcuts
- Cleans up on unmount
- Ignores shortcuts when focus is inside an `<input>`, `<textarea>`, or element with `contenteditable` (exception: `mod+enter` should still work inside Monaco editor)

### Component: `components/ShortcutGuide.tsx`

A Radix `Dialog` that displays all shortcuts:

- Triggered by `Shift+?` globally, or a `?` icon button in the NavBar (next to the settings gear)
- Layout: grouped by scope ("Global", "Query Editor", "Data Viewer", "Topology")
- Each shortcut: label on the left, key combo rendered as styled `<kbd>` tags on the right
- Platform-aware: shows `⌘` on Mac, `Ctrl` on Windows/Linux

### Integration

Each page registers its own shortcuts via the hook:

**Query page:**
```typescript
useKeyboardShortcuts("query", {
  "execute-query": handleExecute,
  "save-query": () => setShowSaveDialog(true),
  "toggle-history": () => setShowHistory(prev => !prev),
  "toggle-chart": () => setShowChart(prev => !prev),
});
```

**Data page:**
```typescript
useKeyboardShortcuts("data", {
  "next-page": () => setPage(p => Math.min(p + 1, totalPages)),
  "prev-page": () => setPage(p => Math.max(p - 1, 1)),
  "export-csv": () => exportToCsv(columns, rows),
});
```

**Global (in AppShell.tsx):**
```typescript
useKeyboardShortcuts("global", {
  "goto-dashboard": () => navigate("/"),
  "goto-ingest": () => navigate("/ingest"),
  "goto-query": () => navigate("/query"),
  "goto-data": () => navigate("/data"),
  "goto-topology": () => navigate("/topology"),
  "toggle-theme": () => useThemeStore.getState().toggle(),
  "show-shortcuts": () => setShowShortcutGuide(true),
});
```

---

## Feature 8: Extended Export

### Goal

Expand export capabilities beyond the current CSV-only export on DataTable.

### Changes to `components/DataTable.tsx`

Replace the single "Export CSV" button with an export dropdown menu (Radix `DropdownMenu`):

**Menu items:**

1. **Export as CSV** — existing behavior
2. **Export as JSON** — download the current page's rows as a formatted JSON array
3. **Export all as CSV** — fetch ALL rows (not just current page) and download as CSV. Show a progress indicator since this may take multiple API calls for large datasets.
4. **Export all as JSON** — same but as JSON
5. **Copy to clipboard** — copy the current page's rows as a TSV (tab-separated values) string to the clipboard. Show a toast: "Copied {n} rows to clipboard"
6. **Copy as JSON** — copy current page's rows as JSON to clipboard. Show toast.

### Export Utility: `lib/exportUtils.ts`

Extract and expand the existing `exportToCsv` logic into a utility module:

```typescript
export function rowsToCsv(columns: Column[], rows: Record<string, unknown>[]): string;
export function rowsToJson(rows: Record<string, unknown>[], pretty?: boolean): string;
export function rowsToTsv(columns: Column[], rows: Record<string, unknown>[]): string;
export function downloadAsFile(content: string, filename: string, mimeType: string): void;
export async function copyToClipboard(text: string): Promise<boolean>;
```

### "Export All" Behavior

For "Export all" options, the component needs to fetch all rows. Add a service function:

In `services/datasets.ts`:

```typescript
export async function getAllTableData(
  params: { type: string; name: string; sortBy?: string; sortDir?: "asc" | "desc" },
  onProgress?: (fetchedRows: number, totalRows: number) => void,
  signal?: AbortSignal,
): Promise<{ columns: Column[]; rows: Record<string, unknown>[]; total: number }>;
```

This function:

1. First calls `getTableData` with `page=1, pageSize=50` to get the `total` count
2. Then fetches remaining pages in parallel batches of 3 requests (pages 2, 3, 4, then 5, 6, 7, etc.)
3. Calls `onProgress` after each batch completes
4. Concatenates all rows and returns them
5. Respects `signal` for cancellation

**Mock implementation**: generate all rows from the mock generator in one shot (no need to paginate in mock mode), but still apply a realistic delay.

### Integration with Query Page

On the query page's results area, add the same export dropdown. Query results are already fully loaded (no pagination), so "Export all" options are not needed — just CSV, JSON, Copy TSV, Copy JSON.

### UI Details

- The export dropdown trigger button: icon `Download` from lucide, text "Export"
- Each menu item has an icon: `FileSpreadsheet` for CSV, `FileJson` for JSON, `Copy` for clipboard actions, `Download` for "all" variants
- "Export all" items show "(all {total} rows)" in the label
- While "export all" is fetching, the menu item changes to a loading state (spinner + "Fetching rows... {progress}%")
- Disable "Export all" items if total > 100,000 rows — show a tooltip: "Too many rows for browser export. Use the Query page to filter first."

---

## Summary Checklist

After implementing all 8 features, verify:

- [ ] `/` shows the Dashboard (not redirect to `/ingest`)
- [ ] NavBar has: Dashboard, Ingest, Data, Query, Topology, Datasets — plus Settings gear and `?` shortcut icon
- [ ] Query page has: chart toggle, save button, History/Saved tabs in sidebar, export dropdown
- [ ] Data page has: chart toggle, column profile buttons in headers, export dropdown, dataset context passed to DataTable
- [ ] Topology page renders a force-directed graph with configurable columns
- [ ] Settings page shows connection config, display prefs, upload config, data management
- [ ] All keyboard shortcuts work and the guide opens with `Shift+?`
- [ ] All new features work in mock mode (`VITE_MOCK=true`)
- [ ] No `any` types, no TypeScript errors, no unused imports
- [ ] Dark mode works on all new UI
- [ ] All new service functions follow the existing pattern (mock check → mock function OR real API call)
