# Lumen — Architecture Document

## What Is Lumen

Lumen is a network data ingestor and analyzer. Users upload files (primarily PCAPs), the backend parses them into a PostgreSQL database, and the frontend lets users browse, query, and eventually visualize that data.

The system has two halves:
- **Backend** — FastAPI (Python). Already built and working. Do not create, modify, or mock backend code.
- **Frontend** — React + TypeScript. This is what you are building.

Deployment target is an **air-gapped LAN** with an internal JFrog Artifactory mirror. No external CDN calls, no runtime fetches to public URLs. Every dependency must be bundled by Vite at build time.

---

## System Overview

```
┌──────────────────────────────────────────────────────┐
│                   React Frontend                      │
│                                                       │
│  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐ │
│  │ Ingest  │  │ Data     │  │ Query  │  │Datasets │ │
│  │ Page    │  │ Viewer   │  │ Page   │  │ Page    │ │
│  └────┬────┘  └────┬─────┘  └───┬────┘  └────┬────┘ │
│       │            │            │             │       │
│  ┌────┴────────────┴────────────┴─────────────┴────┐ │
│  │              Components Layer                    │ │
│  │  FileUpload · DataTable · StatusBadge · Chart    │ │
│  │  Toast · Button · Dialog (Radix UI)              │ │
│  └────────────────────┬────────────────────────────┘ │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐ │
│  │   Hooks                │   Services              │ │
│  │   useFileUpload        │   api.ts (fetch wrapper)│ │
│  │   useWebSocket         │   datasets.ts           │ │
│  │   useQueryHistory      │   query.ts              │ │
│  │                        │   ws.ts                 │ │
│  └────────────────────────┴─────────────────────────┘ │
│                       │                               │
│  ┌────────────────────┴────────────────────────────┐ │
│  │   Constants & Types                              │ │
│  │   fileTypes.ts · uploadStatus.ts · apiTypes.ts   │ │
│  └──────────────────────────────────────────────────┘ │
└───────────────────────┬──────────────────────────────┘
                        │ HTTP + WebSocket
                        ▼
┌──────────────────────────────────────────────────────┐
│                 FastAPI Backend                        │
│              (already built — hands off)              │
│                                                       │
│  POST /ingest/pcap            single file upload      │
│  POST /ingest/pcap/batch      batch file upload       │
│  WS   /ws/status/{job_id}     real-time job status    │
│  GET  /datasets/types         available dataset types  │
│  GET  /datasets/{type}/tables table list for a type   │
│  GET  /datasets/{type}/tables/{name}                  │
│       ?page=&pageSize=&sortBy=&sortDir=&filters=      │
│  POST /query                  execute SQL query        │
└───────────────────────┬──────────────────────────────┘
                        │
                        ▼
                   PostgreSQL
```

---

## Tech Stack

| Layer         | Choice                                    |
|---------------|-------------------------------------------|
| Bundler       | Vite                                      |
| Framework     | React 18                                  |
| Language      | TypeScript (strict mode)                  |
| UI primitives | Radix UI (@radix-ui/react-*)              |
| Server state  | TanStack Query (React Query)              |
| Client state  | Zustand                                   |
| Tables        | TanStack Table + @tanstack/react-virtual  |
| Charts        | Recharts (Phase 3)                        |
| SQL editor    | Monaco Editor (lazy loaded)               |
| Drag-and-drop | react-dropzone                            |
| Testing       | Vitest                                    |

---

## Directory Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login.tsx                    # auth page (Phase 3)
│   └── (app)/
│       ├── ingest/
│       │   └── page.tsx                 # file upload interface
│       ├── data/
│       │   └── [datasetId]/
│       │       └── page.tsx             # PostgreSQL table browser
│       ├── query/
│       │   └── page.tsx                 # SQL query interface
│       └── datasets/
│           └── page.tsx                 # dataset listing
├── components/
│   ├── FileUpload.tsx                   # upload orchestration
│   ├── DataTable.tsx                    # virtualized table (reused everywhere)
│   ├── StatusBadge.tsx                  # UPLOADED|QUEUED|PROCESSING|PARSED|FAILED
│   ├── Chart.tsx                        # Recharts wrapper (Phase 3)
│   └── ui/
│       ├── Toast.tsx                    # transient notifications
│       ├── Button.tsx                   # styled Radix button
│       └── Dialog.tsx                   # modal dialogs
├── services/                            # ALL API calls live here
│   ├── api.ts                           # fetch wrapper, ApiError class
│   ├── datasets.ts                      # upload, list, CRUD
│   ├── query.ts                         # SQL execution
│   └── ws.ts                            # WebSocket connection manager
├── hooks/
│   ├── useFileUpload.ts                 # upload state machine
│   ├── useWebSocket.ts                  # WS subscription per job_id
│   └── useQueryHistory.ts              # localStorage query history
├── constants/
│   ├── fileTypes.ts                     # allowed: .csv .json .parquet .xlsx .pcap
│   ├── uploadStatus.ts                  # status enum + display config
│   └── apiTypes.ts                      # all shared TypeScript interfaces
└── lib/
    └── queryClient.ts                   # TanStack Query config
```

---

## Backend API Contract

Base URL comes from env var `VITE_BASE_URL`. WebSocket URL from `VITE_WS_URL`. Never hardcode.

### Ingest

```
POST {BASE_URL}/ingest/pcap
  Body: multipart/form-data with file field
  Response: { job_id: string, status: "UPLOADED" }

POST {BASE_URL}/ingest/pcap/batch
  Body: multipart/form-data with multiple file fields
  Response: { jobs: [{ job_id: string, filename: string, status: "UPLOADED" }] }
```

### Job Status (WebSocket)

```
WS {WS_URL}/ws/status/{job_id}

Server sends JSON messages:
  { job_id: string, status: "UPLOADED" | "QUEUED" | "PROCESSING" | "PARSED" | "FAILED", message?: string, progress?: number }
```

### Datasets

```
GET {BASE_URL}/datasets/types
  Response: { types: ["pcap", ...] }

GET {BASE_URL}/datasets/{type}/tables
  Response: { tables: [{ name: string, row_count: number, columns: Column[] }] }

GET {BASE_URL}/datasets/{type}/tables/{name}?page=1&pageSize=50&sortBy=col&sortDir=asc&filters={}
  Response: { rows: Record<string, unknown>[], total: number, page: number, pageSize: number }
```

### Query

```
POST {BASE_URL}/query
  Body: { sql: string }
  Response: { columns: Column[], rows: Record<string, unknown>[], row_count: number }
```

### Shared Types

```typescript
type UploadStatus = "UPLOADED" | "QUEUED" | "PROCESSING" | "PARSED" | "FAILED";

interface Column {
  name: string;
  type: "string" | "number" | "date" | "boolean" | "unknown";
  nullable_pct: number;  // 0-100
}

interface ApiError {
  code: "UPLOAD_FAILED" | "PARSE_TIMEOUT" | "INVALID_FILE_TYPE" | "SERVER_ERROR" | "NETWORK_ERROR";
  status?: number;
  message: string;
  detail?: string;
}
```

---

## Feature Specifications

### Feature 1: File Upload (Phase 1)

The ingest page is the primary entry point. Users upload PCAP files (or other supported types) which are sent to the backend for parsing.

**Upload flow:**
1. User drags files onto drop zone (or clicks to browse)
2. Client validates file type against allowlist in `constants/fileTypes.ts`
3. Invalid files are rejected immediately with a toast notification
4. Valid files are uploaded via `services/datasets.ts` → POST `/ingest/pcap` or `/ingest/pcap/batch`
5. Backend returns `job_id` per file
6. Frontend subscribes to `WS /ws/status/{job_id}` for real-time status updates
7. UI shows per-file progress bar, percentage, and status badge
8. On failure: retry with exponential backoff (1s → 2s → 4s), 3 attempts max

**UI requirements:**
- Drag-and-drop zone with dashed border, visual highlight on drag-over
- File list showing: filename, size, progress bar, status badge, remove/retry button
- Estimated time remaining (calculated from upload speed)
- Toast notifications for errors (user-friendly message, full error to console in dev)

**State management:**
- Upload state machine lives in `hooks/useFileUpload.ts`
- WebSocket subscription in `hooks/useWebSocket.ts`
- All API calls through `services/` — never `fetch()` in components

### Feature 2: PostgreSQL Data Viewer (Phase 2)

Users browse parsed data stored in PostgreSQL, organized by dataset type.

**Navigation:**
1. User selects a dataset type (e.g., PCAP) from the datasets page
2. Left sidebar shows related tables: `synced_pcap`, `traffic_pcap`, `traffic_pcap_metadata`, etc.
3. Clicking a table loads its data in `DataTable.tsx`

**DataTable requirements:**
- Built with TanStack Table + virtual scrolling for performance
- Server-side pagination (mandatory for tables >10k rows)
- Column sorting (click header to toggle asc/desc)
- Per-column filtering
- Column type indicators (string, number, date, null percentage)
- Row count display
- Export visible page to CSV

### Feature 3: SQL Query Interface (Phase 2)

Power users can write raw SQL queries against the database.

- Monaco Editor with SQL syntax highlighting
- Basic autocomplete for table and column names (populated from `/datasets/{type}/tables`)
- Execute button → POST `/query` → results displayed in DataTable
- Query history stored in localStorage via `hooks/useQueryHistory.ts`
- Export results to CSV

### Feature 4: Visualization (Phase 3)

Users create charts from query results or table data.

- `components/Chart.tsx` wraps Recharts
- Supported chart types: bar, line, scatter, histogram
- User dynamically selects X axis column, Y axis columns, chart type
- Save/load chart configurations per dataset (localStorage initially)

### Feature 5: Dataset Management (Phase 3)

- List all ingested datasets with metadata (row count, column count, upload date, status)
- Actions: delete, rename, re-ingest
- Show ingestion job status: queued, processing, completed, failed

### Feature 6: Auth & Permissions (Phase 3)

- Role-based access: viewer, editor, admin
- Route protection based on role
- API key management for programmatic uploads

---

## Design Direction

**Aesthetic:** Practical, utilitarian, modern. Think "ops dashboard" — not a marketing site. Clean data density for table views. Clear status indicators with semantic color coding.

**Principles:**
- Dark and light mode support (system preference + manual toggle)
- Compact layouts for data-heavy views (tables, query results)
- Generous spacing on action-oriented views (upload, dataset cards)
- Status colors: blue = UPLOADED, amber = QUEUED, teal = PROCESSING, green = PARSED, red = FAILED
- Monospace font for SQL editor, data cells with numbers/dates
- Sans-serif for UI chrome and labels

---

## Development Phases

### Phase 1 (Current) — Ingest
- [ ] `services/api.ts` — fetch wrapper with typed errors
- [ ] `services/datasets.ts` — upload endpoints
- [ ] `services/ws.ts` — WebSocket manager
- [ ] `hooks/useFileUpload.ts` — upload state machine
- [ ] `hooks/useWebSocket.ts` — WS subscription
- [ ] `components/FileUpload.tsx` — full upload UI
- [ ] `components/StatusBadge.tsx`
- [ ] `components/ui/Toast.tsx`
- [ ] `app/(app)/ingest/page.tsx` — ingest page
- [ ] App shell with navigation (Ingest, Data, Query, Datasets)
- [ ] `.env.example` with all required vars

### Phase 2 — Data & Query
- [ ] `components/DataTable.tsx` — virtualized table
- [ ] `services/query.ts` — SQL execution
- [ ] `hooks/useQueryHistory.ts`
- [ ] `app/(app)/data/[datasetId]/page.tsx` — table browser
- [ ] `app/(app)/query/page.tsx` — SQL interface
- [ ] `app/(app)/datasets/page.tsx` — dataset listing

### Phase 3 — Visualization & Management
- [ ] `components/Chart.tsx` — Recharts wrapper
- [ ] Dataset management actions
- [ ] Auth & role-based access
- [ ] API key management

---

## Air-Gap Deployment Checklist

- `vite.config.ts`: `base: './'` for relative asset paths
- Monaco Editor workers bundled inline (configure `MonacoEnvironment.getWorkerUrl` to local path)
- No runtime CDN fetches in any dependency
- All deps in `package-lock.json` with exact versions for JFrog mirror
- `.env.example` documents: `VITE_BASE_URL`, `VITE_WS_URL`
