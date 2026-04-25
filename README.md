# Lumen

Network data ingestor and analyzer. React + TypeScript frontend for a FastAPI backend. Designed for air-gapped LAN deployment.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Set `VITE_MOCK=true` in `.env` to run with simulated backend responses.

## Stack

- Vite, React 18, TypeScript (strict)
- Tailwind CSS v4, Radix UI, Zustand, TanStack Query
- Geist font (bundled)

## Project structure

```
src/
├── app/(app)/          Page components (ingest, data, query, datasets)
├── components/         UI components (FileUpload, StatusBadge, NavBar, etc.)
├── services/           API layer (fetch wrapper, datasets, WebSocket, mock)
├── hooks/              State machines (useFileUpload, useIngestHistory, useTheme)
├── constants/          Types, enums, config (apiTypes, fileTypes, uploadStatus)
└── lib/                TanStack Query client config
```

## Environment variables

| Variable | Description |
|---|---|
| `VITE_BASE_URL` | Backend HTTP base URL |
| `VITE_WS_URL` | Backend WebSocket base URL |
| `VITE_MOCK` | `true` to use mock data without a backend |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build |
