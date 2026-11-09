# Batches Page — Backend Contract

**Branch:** `feature/batches-page` · **Frontend source of truth:** `services/batches.ts`, `services/batchStatus.ts`, `app/(app)/batches/page.tsx` · **Framework assumed:** FastAPI + Pydantic v2

This document lists everything the Batches page needs from the backend: every endpoint, every field, the exact request and response shapes, the rules the frontend relies on, and what each button does. If the backend follows it, the page works with the mock switched off (`VITE_MOCK=false`). If something here conflicts with the code, the code wins. Please flag the mismatch so this file gets fixed.

Wording used below:
- **MUST**: the page breaks or shows wrong data without it.
- **SHOULD**: strongly recommended. The page works, but worse.
- **Suggested**: implementation guidance only. Do it your way.

---

## Contents

1. [Global conventions](#1-global-conventions)
2. [Endpoint summary](#2-endpoint-summary)
3. [Data models](#3-data-models)
4. [Batch status and filter rules](#4-batch-status-and-filter-rules)
5. [Endpoints in detail](#5-endpoints-in-detail)
6. [The pipeline](#6-the-pipeline)
7. [Notes](#7-notes)
8. [Data tables and the "open in Data" links](#8-data-tables-and-the-open-in-data-links)
9. [Page behaviour reference (what calls what, and when)](#9-page-behaviour-reference)
10. [Frontend-only features (no endpoint needed)](#10-frontend-only-features)
11. [Future: users and authentication](#11-future-users-and-authentication)
12. [Open questions for the backend](#12-open-questions-for-the-backend)
13. [Implementation checklist](#13-implementation-checklist)

---

## 1. Global conventions

### 1.1 Base URL and transport
- The frontend prefixes every path with `VITE_BASE_URL` (e.g. `http://localhost:8000`). The paths below are relative to it.
- Requests and responses are JSON (`Content-Type: application/json`). The only exception is the graphs download (§5.7).
- Path parameters are URL-encoded by the frontend (`encodeURIComponent`). FastAPI decodes them automatically.

### 1.2 Field naming
- JSON fields are **snake_case** (`batch_id`, `created_at`, `file_counts`, …).
- **One exception:** the list endpoint's page-size **query parameter** is camelCase, `pageSize`. This matches the existing `/datasets/.../tables/...` endpoint. Use `Query(alias="pageSize")`.

### 1.3 Timestamps
- Timestamps are ISO-8601 strings in UTC, e.g. `"2026-11-10T08:15:00Z"`. Pydantic's `datetime` with a UTC timezone is fine (`+00:00` also parses).
- The frontend computes relative times ("4m ago") and durations from these values, so they MUST be accurate and include a timezone.

### 1.4 `null` vs missing
- Fields typed `X | null` MUST be present and set to `null` when there is no value. Don't omit them.
- Fields marked *optional* (`?`) may be omitted. Only pipeline steps have optional fields: `table`, `filter_by`, `graphs`.

### 1.5 Success responses — IMPORTANT
The frontend's HTTP helpers (`services/api.ts`) behave as follows:

| Method | On a 2xx the frontend… | So the backend MUST |
|---|---|---|
| `GET` | parses the body as JSON | return a JSON body |
| `POST` | parses the body as JSON | return a JSON body, **never `204` or an empty body** |
| `PATCH` | parses the body as JSON | return a JSON body, **never `204` or an empty body** |
| `DELETE` | accepts `204 No Content`, otherwise parses JSON | return `204` (preferred) or a JSON body |

A `POST`/`PATCH` that answers `204` (or `200` with an empty body) is reported to the user as **"Unable to connect to the server"**, even though the action succeeded. For the action endpoints (cancel, retry, rename), returning the updated `BatchDetail` is the simplest option. The frontend ignores the body, but it must be valid JSON.

### 1.6 Error responses — IMPORTANT
On any non-2xx response the frontend reads this JSON shape:

```json
{ "code": "SERVER_ERROR", "message": "Batch batch-0417 not found", "detail": "optional extra text" }
```

- `message` is shown to the user in a toast, so it MUST be human-readable.
- `code` MUST be one of: `"UPLOAD_FAILED" | "PARSE_TIMEOUT" | "INVALID_FILE_TYPE" | "SERVER_ERROR" | "NETWORK_ERROR"`. Use `"SERVER_ERROR"` for everything on this page.
- FastAPI's default error body is `{"detail": "..."}`. The frontend does **not** read `detail` as the message. The user would see "Request failed with status 404". Add exception handlers:

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": "SERVER_ERROR", "status": exc.status_code, "message": str(exc.detail)},
    )

@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    return JSONResponse(
        status_code=422,
        content={
            "code": "SERVER_ERROR",
            "status": 422,
            "message": f"Invalid {'.'.join(map(str, first.get('loc', [])[1:])) or 'request'}: {first.get('msg', '')}",
            "detail": str(exc.errors()),
        },
    )
```

### 1.7 Status codes used on this page

| Code | When |
|---|---|
| `200` | Successful `GET`, `POST`, `PATCH` (with JSON body) |
| `201` | Successful `POST /notes` (also fine, it carries a body) |
| `204` | Successful `DELETE` |
| `404` | Batch or note doesn't exist (or isn't the caller's) |
| `409` | Action not valid in the current state (cancel a finished batch, retry with no failed files) |
| `422` | Validation error (empty note body, bad `filter` value, …) |

### 1.8 Scoping
`GET /batches` returns **only the caller's batches** ("Everything you've uploaded"). There are no users yet (§11), so today this means all batches. Design the queries so that adding an `owner = :current_user` condition later is a one-line change.

---

## 2. Endpoint summary

| # | Method & path | Used by | Status |
|---|---|---|---|
| 5.1 | `GET /batches` | Batch list, tabs, search, pagination, polling | Exists; **must gain params + `counts` + `has_active`** |
| 5.2 | `GET /batches/{batch_id}` | Expanded batch panel, `?open=` deep link | Exists; **must gain `run_id`, `files[].iteration`, `pipeline`, `note_count`** |
| 5.3 | `PATCH /batches/{batch_id}` | "Edit title" button | **New** |
| 5.4 | `DELETE /batches/{batch_id}` | "Delete batch" button | Exists; must cascade to notes |
| 5.5 | `POST /batches/{batch_id}/cancel` | "Cancel batch" button | **New** |
| 5.6 | `POST /batches/{batch_id}/retry` | "Retry failed (N)" button | **New** |
| 5.7 | `GET /batches/{batch_id}/graphs` | "Export graphs" button | **New** (needed once graphs exist) |
| 5.8 | `GET /batches/{batch_id}/notes` | Notes section (on expand) | **New** |
| 5.9 | `POST /batches/{batch_id}/notes` | Notes "Post" | **New** |
| 5.10 | `PATCH /batches/{batch_id}/notes/{note_id}` | Note "Edit" → Save | **New** |
| 5.11 | `DELETE /batches/{batch_id}/notes/{note_id}` | Note "Delete" → Yes | **New** |
| 8 | `POST /query` | Every "open in Data" link (pipeline nodes, file iteration links) | Exists; must handle the SQL in §8 |
| 8 | `GET /datasets/{type}/tables` | Data page sidebar when a link opens it | Exists; see §8.3 |

Not needed: "Share batch" and "Export file list" (§10).

---

## 3. Data models

These Pydantic models mirror the TypeScript types in `services/batches.ts`. Names and nesting are **MUST**. The Python class names are only suggestions.

```python
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field

# ── File / job status (one per file) ────────────────────────────
UploadStatus = Literal["UPLOADED", "QUEUED", "PROCESSING", "PARSED", "FAILED"]

# ── Pipeline step status (one per parser / analysis / graph) ─────
PipelineStepStatus = Literal["QUEUED", "PROCESSING", "FINISHED", "FAILED"]

BatchFilter = Literal["active", "attention", "completed"]   # "all" = parameter omitted


class BatchSummary(BaseModel):
    batch_id: str
    ingest_type: str                     # e.g. "pcap", "netflow"; also the Data page dataset type
    title: str | None                    # user-editable, nullable
    owner: str | None                    # who uploaded it
    created_at: datetime
    started_at: datetime | None          # null until the first file starts processing
    finished_at: datetime | None         # null while any file is UPLOADED/QUEUED/PROCESSING
    file_count: int                      # == len(files)
    total_bytes: int                     # == sum(file.size_bytes)
    file_counts: dict[UploadStatus, int] # number of files per status; missing key = 0


class BatchFile(BaseModel):
    job_id: str                          # unique within the batch (React key + expand state)
    filename: str
    iteration: int                       # zero-based iteration group, see §6.6
    size_bytes: int
    status: UploadStatus
    progress: int | None                 # 0–100 while PROCESSING, otherwise null
    rows_written: int | None             # null if the file never started
    error: str | None                    # human-readable; set when status == FAILED, else null
    started_at: datetime | None
    finished_at: datetime | None


class PipelineGraph(BaseModel):
    name: str
    status: PipelineStepStatus


class PipelineStep(BaseModel):
    name: str                                            # display name; unique within its list
    status: PipelineStepStatus
    table: str | None = None                             # OPTIONAL; defaults to `name`
    filter_by: Literal["run_id", "batch_id"] | None = None   # OPTIONAL; defaults to "run_id"
    graphs: list[PipelineGraph] | None = None            # OPTIONAL; analyses only (§6.4)


class PipelineBranch(BaseModel):
    parser: PipelineStep
    analyses: list[PipelineStep]


class BatchDetail(BatchSummary):
    run_id: str                          # the pipeline run for this batch (§6.5)
    source: str | None                   # "Web upload", "API key · ci-nightly", …
    parser: str | None                   # free text shown in Details, e.g. "pcap-parser 2.3.1"
    rows_written: int | None             # sum of file rows_written; null until started
    files: list[BatchFile]
    pipeline: list[PipelineBranch]       # [] if no pipeline (section is then hidden)
    note_count: int                      # shown on the collapsed Notes header


class BatchListResponse(BaseModel):
    batches: list[BatchSummary]          # just this page
    total: int                           # number of batches matching filter + q (all pages)
    counts: dict[Literal["all", "active", "attention", "completed"], int]  # all four keys MUST be present
    has_active: bool                     # any of the caller's batches still running (§4.3)


class BatchNote(BaseModel):
    id: str
    batch_id: str
    author: str
    body: str
    created_at: datetime
    updated_at: datetime | None          # null until edited (frontend shows "· edited")


class NewBatchNote(BaseModel):
    author: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=5000)


class UpdateBatchNote(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class UpdateBatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
```

When serializing, use `response_model_exclude_none=False` (the default) so that `null` fields are sent, as §1.4 requires. For `PipelineStep`, the optional fields may be sent as `null` or omitted; the frontend handles both.

### 3.1 Notes on specific fields
- **`file_counts`**: only statuses with at least one file need a key. `{"PARSED": 12, "PROCESSING": 2, "QUEUED": 1}` is correct.
- **`files` order**: the Files list renders files **in the order sent**. SHOULD be sorted by `iteration` ascending, then filename.
- **`error`**: shown verbatim in a red box in the file dropdown. Write it for a human ("Truncated packet at offset 0x3F2A10."), not as a stack trace.
- **`parser`** (the string on `BatchDetail`): legacy free-text shown in the Details card ("Parser" row). It is unrelated to `pipeline[].parser`.
- **`tables`**: previously on `BatchDetail`. **No longer used.** The pipeline defines the tables now, so don't send it (harmless if you do).

---

## 4. Batch status and filter rules

The frontend **derives** each batch's status from `file_counts` (`services/batchStatus.ts`). The badge colours, filter tabs and "active" logic all depend on it. The backend MUST apply **exactly the same rules** when it filters `GET /batches` and computes `counts`, or a tab would show a count that disagrees with the badges in its rows.

### 4.1 Status of one batch (from its files)

```python
def batch_status(file_counts: dict[str, int], file_count: int) -> str:
    waiting = file_counts.get("UPLOADED", 0) + file_counts.get("QUEUED", 0)
    failed = file_counts.get("FAILED", 0)
    if file_count > 0 and waiting == file_count:
        return "QUEUED"
    if file_counts.get("PROCESSING", 0) > 0 or waiting > 0:
        return "PROCESSING"
    if file_count > 0 and failed == file_count:
        return "FAILED"
    if failed > 0:
        return "COMPLETED_WITH_ERRORS"
    return "COMPLETED"            # includes a batch with zero files
```

| Status | Badge label | Colour |
|---|---|---|
| `QUEUED` | Queued | amber |
| `PROCESSING` | Processing | teal (pulsing) |
| `COMPLETED` | Completed | green |
| `COMPLETED_WITH_ERRORS` | Completed with errors | orange |
| `FAILED` | Failed | red |

### 4.2 Filter tabs

| `filter` param | Tab label | Matches statuses |
|---|---|---|
| *(omitted)* | All | everything |
| `active` | Active | `QUEUED`, `PROCESSING` |
| `attention` | Needs attention | `FAILED`, `COMPLETED_WITH_ERRORS` |
| `completed` | Completed | `COMPLETED` |

`counts.all/active/attention/completed` are the sizes of these four sets over **all of the caller's batches**, ignoring `q` and pagination.

### 4.3 `has_active` (drives list polling)
`has_active` = at least one of the caller's batches is still doing work. It SHOULD be:

```
batch_status(...) in {"QUEUED", "PROCESSING"}
OR any pipeline step (parser, analysis or graph) of that batch is QUEUED or PROCESSING
```

The second condition matters: once every file is parsed, the analyses and graphs may still be running. If `has_active` were based on files alone, list polling would stop too early. The filter tabs and `counts` stay **file-based** (§4.1/4.2) so they keep matching the row badges.

> Possible future improvement (not required): send a `status` field on every `BatchSummary` so the frontend stops deriving it. That needs a small frontend change and should be coordinated.

---

## 5. Endpoints in detail

Each FastAPI sketch below shows the shape only. Storage, sessions and auth are up to you.

```python
from fastapi import APIRouter, HTTPException, Query, Response

router = APIRouter(prefix="/batches", tags=["batches"])
```

### 5.1 `GET /batches` — list batches (paged, filtered, searched)

**Used by:** the batch table, the four filter tabs (badge counts), the search box, the pagination footer, and list polling.

**Query parameters**

| Param | Type | Required | Notes |
|---|---|---|---|
| `page` | int ≥ 1 | yes (always sent) | 1-based |
| `pageSize` | int | yes (always sent) | UI offers 10 / 20 / 50, default 20. SHOULD cap at e.g. 100 |
| `filter` | `active` \| `attention` \| `completed` | no | omitted = All tab. Never sent as `all` |
| `q` | string | no | already trimmed; omitted when empty. Case-insensitive **substring** match on `batch_id`, `title`, `owner`, `ingest_type` (any of them) |

**Rules**
- Sort **newest first** (`created_at DESC`). Pagination is applied **after** filter and search.
- `total` = number of batches matching `filter` **and** `q`. The footer shows "21–40 of {total}" and computes the page count from it.
- `counts` ignores `q`, `filter` and pagination (§4.2).
- A `page` past the end returns `batches: []` with the correct `total`. The frontend then steps back to the last page.
- `batches[]` items are `BatchSummary`, **not** `BatchDetail`. Don't include `files`, `pipeline` or notes; the list is polled every 3 s.

**Example request**
```
GET /batches?page=1&pageSize=20&filter=attention&q=edge
```

**Example response** `200`
```json
{
  "batches": [
    {
      "batch_id": "batch-0417",
      "ingest_type": "pcap",
      "title": "Edge nodes overnight",
      "owner": "alice",
      "created_at": "2026-11-10T07:12:00Z",
      "started_at": "2026-11-10T07:12:20Z",
      "finished_at": "2026-11-10T07:33:20Z",
      "file_count": 13,
      "total_bytes": 2768240640,
      "file_counts": { "PARSED": 11, "FAILED": 2 }
    }
  ],
  "total": 1,
  "counts": { "all": 23, "active": 2, "attention": 7, "completed": 14 },
  "has_active": true
}
```

**Sketch**
```python
@router.get("", response_model=BatchListResponse)
def list_batches(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    status_filter: BatchFilter | None = Query(None, alias="filter"),
    q: str | None = Query(None, max_length=200),
):
    mine = repo.batches_for(current_user())            # all of the caller's batches (summaries)
    statuses = {b.batch_id: batch_status(b.file_counts, b.file_count) for b in mine}

    counts = {
        "all": len(mine),
        "active": sum(s in ("QUEUED", "PROCESSING") for s in statuses.values()),
        "attention": sum(s in ("FAILED", "COMPLETED_WITH_ERRORS") for s in statuses.values()),
        "completed": sum(s == "COMPLETED" for s in statuses.values()),
    }
    has_active = any(
        statuses[b.batch_id] in ("QUEUED", "PROCESSING") or repo.has_running_step(b.batch_id)
        for b in mine
    )

    matches = [b for b in mine if matches_filter(statuses[b.batch_id], status_filter)]
    if q:
        needle = q.lower()
        matches = [b for b in matches
                   if any(needle in (v or "").lower() for v in (b.batch_id, b.title, b.owner, b.ingest_type))]
    matches.sort(key=lambda b: b.created_at, reverse=True)

    start = (page - 1) * page_size
    return BatchListResponse(batches=matches[start:start + page_size], total=len(matches),
                             counts=counts, has_active=has_active)
```
> With thousands of batches, do this in SQL (status as a computed column or view, `ILIKE` for `q`, `LIMIT/OFFSET`, one `GROUP BY` for counts). The logic must still equal §4.

---

### 5.2 `GET /batches/{batch_id}` — batch detail

**Used by:**
- the expanded panel (Actions, Details, Files, Pipeline, Notes header count);
- the `?open=<id>` deep link when the batch isn't on the current page (§9.4). A `404` there shows "Couldn't load {id}. It may have been deleted."

**Response** `200`: `BatchDetail` (§3). `404` if it doesn't exist.

**Polled** every 3 s while the panel is open **and** the batch is active (file-based) **or** any pipeline step or graph is `QUEUED`/`PROCESSING`. Keep it reasonably cheap.

**Example response.** `files` is shortened to 2 of the 13 entries to save space. A real response MUST list all 13: `file_count`, `file_counts`, `total_bytes` and `rows_written` are always derived from the **full** `files` list.
```json
{
  "batch_id": "batch-0417",
  "run_id": "run-0417",
  "ingest_type": "pcap",
  "title": "Edge nodes overnight",
  "owner": "alice",
  "created_at": "2026-11-10T07:12:00Z",
  "started_at": "2026-11-10T07:12:20Z",
  "finished_at": "2026-11-10T07:33:20Z",
  "file_count": 13,
  "total_bytes": 2768240640,
  "file_counts": { "PARSED": 11, "FAILED": 2 },
  "source": "API key · ci-nightly",
  "parser": "pcap-parser 2.3.1",
  "rows_written": 14211520,
  "note_count": 1,
  "files": [
    {
      "job_id": "job_0417_001",
      "filename": "edge-01.pcap",
      "iteration": 0,
      "size_bytes": 167772160,
      "status": "PARSED",
      "progress": null,
      "rows_written": 932067,
      "error": null,
      "started_at": "2026-11-10T07:12:20Z",
      "finished_at": "2026-11-10T07:12:28Z"
    },
    {
      "job_id": "job_0417_003",
      "filename": "edge-03.pcap",
      "iteration": 1,
      "size_bytes": 201326592,
      "status": "FAILED",
      "progress": null,
      "rows_written": null,
      "error": "Truncated packet at offset 0x3F2A10. The capture ends mid-frame.",
      "started_at": "2026-11-10T07:13:20Z",
      "finished_at": "2026-11-10T07:13:30Z"
    }
  ],
  "pipeline": [
    {
      "parser": { "name": "PcapParser", "status": "FINISHED" },
      "analyses": [
        {
          "name": "ConnectionAnalysis",
          "status": "FINISHED",
          "graphs": [
            { "name": "ConnectionsOverTime", "status": "FINISHED" },
            { "name": "TopPorts", "status": "FINISHED" }
          ]
        },
        { "name": "DnsAnalysis", "status": "FINISHED" },
        { "name": "HttpAnalysis", "status": "FAILED" }
      ]
    },
    {
      "parser": { "name": "TlsParser", "status": "FINISHED" },
      "analyses": [
        { "name": "CertAnalysis", "status": "FINISHED" },
        { "name": "Ja3Analysis", "status": "FINISHED", "filter_by": "batch_id" }
      ]
    }
  ]
}
```

**Sketch**
```python
@router.get("/{batch_id}", response_model=BatchDetail)
def get_batch(batch_id: str):
    batch = repo.get_batch(batch_id, owner=current_user())
    if batch is None:
        raise HTTPException(404, f"Batch {batch_id} not found")
    return batch
```

---

### 5.3 `PATCH /batches/{batch_id}` — edit title

**Used by:** **Edit title**, which turns into an inline input with Save and Cancel.

**Request body**
```json
{ "title": "Edge nodes overnight (re-run)" }
```
- The frontend trims the input and sends **`null` if it's empty**. `null` MUST clear the title.
- Only `title` is sent. Ignore unknown fields, or reject them with `422`.

**Response** `200`: the updated `BatchDetail` (MUST be a JSON body, §1.5). `404` if not found.

**After success** the frontend re-fetches the batch and the list, and shows the toast "Title updated".

```python
@router.patch("/{batch_id}", response_model=BatchDetail)
def update_batch(batch_id: str, body: UpdateBatch):
    batch = repo.get_batch(batch_id, owner=current_user()) or _404(batch_id)
    title = (body.title or "").strip() or None
    return repo.set_title(batch_id, title)
```

---

### 5.4 `DELETE /batches/{batch_id}` — delete batch

**Used by:** **Delete batch** (red, always last in the Actions column). A confirmation dialog says *"This removes the batch and its N files. This can't be undone."*

**Response** `204` (preferred) or `200` with JSON. `404` if not found.

**MUST** also delete the batch's **notes** (§7). See §12 for whether the parsed rows in data tables are deleted too.

**After success** the frontend drops the row from every cached page right away, closes the panel, re-fetches the list (so the next batch moves up), and shows the toast "Deleted {batch_id}".

```python
@router.delete("/{batch_id}", status_code=204)
def delete_batch(batch_id: str):
    repo.get_batch(batch_id, owner=current_user()) or _404(batch_id)
    repo.delete_batch(batch_id)          # cascades to notes (FK ON DELETE CASCADE)
    return Response(status_code=204)
```

---

### 5.5 `POST /batches/{batch_id}/cancel` — cancel batch

**Used by:** **Cancel batch**, which is only shown while the batch is `QUEUED` or `PROCESSING` (file-based, §4.1). It asks inline, "Stop it? Yes / No", before calling.

**Request body:** `{}` (the frontend sends an empty JSON object).

**Expected effect**
- Every file in `UPLOADED`, `QUEUED` or `PROCESSING` stops. There is **no `CANCELLED` file status** in the frontend, so set those files to **`FAILED`** with `error: "Cancelled."` (or a similar human-readable message). The batch then shows up under *Needs attention*, and **Retry failed** can restart them.
- Already `PARSED` files are untouched.
- `finished_at` gets set, because nothing is active any more.
- Pipeline steps that were waiting and will now never run MUST NOT stay `QUEUED` (see §6.3): mark them `FAILED`.

**Response** `200`: the updated `BatchDetail` (JSON body MUST, §1.5). `404` if not found. `409` if nothing is active (the message is shown in a toast).

**After success**, the toast reads "Cancelled {batch_id}", and the batch and list are re-fetched.

```python
@router.post("/{batch_id}/cancel", response_model=BatchDetail)
def cancel_batch(batch_id: str):
    batch = repo.get_batch(batch_id, owner=current_user()) or _404(batch_id)
    if not any(f.status in ("UPLOADED", "QUEUED", "PROCESSING") for f in batch.files):
        raise HTTPException(409, f"{batch_id} isn't running")
    worker.cancel(batch.run_id)
    repo.mark_active_files_failed(batch_id, error="Cancelled.")
    repo.fail_unstarted_steps(batch.run_id)
    return repo.get_batch(batch_id)
```

---

### 5.6 `POST /batches/{batch_id}/retry` — retry failed files

**Used by:** **Retry failed (N)**, which is only shown when `file_counts.FAILED > 0`. N is that count. There is no confirmation.

**Request body:** `{}`.

**Expected effect**
- **Only** `FAILED` files go back to `QUEUED`. For each one: clear `error`, `progress`, `rows_written`, `started_at` and `finished_at`, and **keep `iteration`**.
- Batch `finished_at` → `null`, since it's active again. The files then flow through the pipeline normally, and the page polls the progress.
- Pipeline steps that need to re-run go back to `QUEUED`/`PROCESSING` so the nodes reflect it.

**Response** `200`: the updated `BatchDetail` (JSON body MUST). `404` if not found. `409` if there are no failed files.

**After success**, the toast reads "Retrying N failed file(s)", and the batch and list are re-fetched. List polling resumes because `has_active` becomes true.

```python
@router.post("/{batch_id}/retry", response_model=BatchDetail)
def retry_failed(batch_id: str):
    batch = repo.get_batch(batch_id, owner=current_user()) or _404(batch_id)
    failed = [f for f in batch.files if f.status == "FAILED"]
    if not failed:
        raise HTTPException(409, f"{batch_id} has no failed files")
    repo.requeue_files(batch_id, [f.job_id for f in failed])
    worker.enqueue(batch.run_id, [f.job_id for f in failed])
    return repo.get_batch(batch_id)
```

---

### 5.7 `GET /batches/{batch_id}/graphs` — download all graphs

**Used by:** **Export graphs**, which is only shown when **at least one graph** in the pipeline has status `FINISHED` (§6.4).

**How the frontend calls it:** it does **not** use `fetch`. It creates an `<a href="{BASE_URL}/batches/{id}/graphs" download>` and clicks it, so the **browser** downloads the response directly. Consequences:
- **Size:** large archives are fine. The file is streamed to disk, not held in page memory.
- **Headers:** the request carries cookies but **no custom headers** (see §11).
- **CORS:** not needed, because it's a navigation, not a script request.

**Response** `200`, the archive bytes. The backend MUST send:
```
Content-Type: application/zip
Content-Disposition: attachment; filename="batch-0417-graphs.zip"
```
`Content-Disposition: attachment` is what makes the browser save the file. The frontend sets **no filename**, so the backend chooses it. If the API is on a different origin from the frontend, the browser ignores the HTML `download` hint, and this header is the only thing that triggers the download.

**Errors:** `404` if the batch doesn't exist or has no generated graphs. The browser shows its own error page here, not a toast, because it navigated. That's acceptable, since the button only appears when graphs exist.

**Archive contents (suggested):** one image per graph, named after the graph and grouped by analysis, e.g.
```
batch-0417-graphs.zip
├── ConnectionAnalysis/ConnectionsOverTime.png
└── ConnectionAnalysis/TopPorts.png
```

```python
from fastapi.responses import StreamingResponse

@router.get("/{batch_id}/graphs")
def download_graphs(batch_id: str):
    batch = repo.get_batch(batch_id, owner=current_user()) or _404(batch_id)
    files = graph_store.list_finished(batch.run_id)              # [(arcname, path), ...]
    if not files:
        raise HTTPException(404, f"No graphs for {batch_id}")
    return StreamingResponse(
        zip_stream(files),                                       # e.g. zipstream / zipfile into a SpooledTemporaryFile
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{batch_id}-graphs.zip"'},
    )
```

---

### 5.8 – 5.11 Notes endpoints
See **§7**. They're kept together there with the storage model.

---

## 6. The pipeline

The pipeline is the workflow submitted with the batch, built in your drag-and-drop pipeline builder. The Batches page only **displays** it and links each step to its data. Its shape is a list of **branches**. Each branch is **one parser**, fed by the batch's raw files, plus the **analyses** fed by that parser's output. There is no overlap between branches.

```
files ─┬─ ParserA ─┬─ AnalysisA ─┬─ GraphA1     (graphs: optional, §6.4)
       │           │             └─ GraphA2
       │           └─ AnalysisB
       └─ ParserB ─┬─ AnalysisC
                   ├─ AnalysisE
                   └─ SomeOtherAnalysis
```

### 6.1 Current schema (MUST)
```json
"pipeline": [
  {
    "parser":   { "name": "ParserA", "status": "FINISHED" },
    "analyses": [
      { "name": "AnalysisA", "status": "FINISHED" },
      { "name": "AnalysisB", "status": "PROCESSING", "filter_by": "batch_id" }
    ]
  },
  {
    "parser":   { "name": "ParserB", "status": "PROCESSING", "table": "parser_b_output" },
    "analyses": [
      { "name": "AnalysisC", "status": "QUEUED" },
      { "name": "AnalysisE", "status": "QUEUED" }
    ]
  }
]
```

| Step field | Required | Meaning | Default |
|---|---|---|---|
| `name` | MUST | Display name. MUST be unique among its siblings (React key). Parser names unique across branches. | — |
| `status` | MUST | `QUEUED` \| `PROCESSING` \| `FINISHED` \| `FAILED` (§6.3) | — |
| `table` | optional | Table this step writes to. Used in the SQL and the Data URL. | `name` |
| `filter_by` | optional | Which column selects this batch's rows in `table`: `"run_id"` or `"batch_id"` | `"run_id"` |
| `graphs` | optional | Graphs generated after this step finishes (analyses only, §6.4) | none |

- **Branch order** and **analysis order** are rendered exactly as sent.
- `pipeline: []` hides the Pipeline section entirely.
- The minimal valid payload is just `name` + `status` per step, as long as the table is named after the step and is filtered by `run_id`.

### 6.2 How it's displayed
- **Card:** a full-width "Pipeline" card at the bottom of the expanded batch. Parser groups sit side by side and wrap onto new lines.
- **Nodes:** each parser is a rectangle, joined by a bracket to its analyses stacked on its right. Large groups (tested with 8 analyses) render fine.
- **Analysis nodes** contain: status dot · table icon · name. **Clicking one opens its table** in the Data page, filtered to this batch (§8). Hovering shows `"{status} · {table} where {column} = {value}"`.
- **Parser nodes** look and behave the same as analysis nodes.
- **Graph nodes** (§6.4) contain: status dot · chart icon · name. They are **not clickable**, since a graph is not a table.

### 6.3 Step status semantics

| Status | Dot colour | Meaning |
|---|---|---|
| `QUEUED` | gray | waiting to run |
| `PROCESSING` | yellow (pulsing) | running |
| `FINISHED` | green | done, output is available |
| `FAILED` | red | failed, **or will never run** |

**MUST:** a step that will **never** run (an analysis whose parser failed, a graph whose analysis failed, everything after a cancel) MUST be reported as `FAILED`, **not left as `QUEUED`**. While any step is `QUEUED`/`PROCESSING`, the open batch polls `GET /batches/{id}` every 3 s, so a step stuck in `QUEUED` makes the panel poll forever. If you'd rather show "skipped" distinctly, it needs a new status value and a small frontend change; coordinate first.

**Expected progression:**
1. Parser: `QUEUED` → `PROCESSING` while files are parsed → `FINISHED`. It becomes `FAILED` only if every file failed.
2. Analyses: `QUEUED` → `PROCESSING` → `FINISHED`/`FAILED`. They start once their parser's output is ready.
3. Graphs: `QUEUED` until their analysis finishes, then `PROCESSING` → `FINISHED`/`FAILED`.

### 6.4 Graphs — the third stage (supported now, optional to send)
Automatic graphs are a service triggered **when an analysis finishes**. The frontend **already supports** them, and the backend can start sending them whenever the service exists. Until then, simply omit `graphs`.

```json
{
  "name": "ConnectionAnalysis",
  "status": "FINISHED",
  "graphs": [
    { "name": "ConnectionsOverTime", "status": "FINISHED" },
    { "name": "TopPorts", "status": "PROCESSING" }
  ]
}
```

- **Before the graph service exists**, `graphs: []`, `graphs: null` and omitting the field are all equivalent and safe. Nothing extra is drawn, the Export graphs button stays hidden, and polling is unaffected. Sending `[]` on every analysis from day one is fine.
- `graphs` is valid **only on analysis steps**. Graphs on a parser are ignored.
- Graph objects have only `name` and `status`, with no `table` or `filter_by`, because they aren't tables.
- Graph `status` follows §6.3, including the "never runs → `FAILED`" rule.
- The **Export graphs** action button appears once **any** graph in the batch is `FINISHED`, and downloads `GET /batches/{id}/graphs` (§5.7).
- Graphs count as "running" for the open batch's polling (§9.2) and SHOULD count for `has_active` (§4.3).

### 6.5 `run_id`
- `BatchDetail.run_id` identifies the pipeline execution for this batch. It is the **default filter value** for every pipeline table (`filter_by` omitted → `WHERE run_id = '<run_id>'`).
- A step with `filter_by: "batch_id"` uses `WHERE batch_id = '<batch_id>'` instead.
- After **Retry**, keep the same `run_id`, or the links will stop finding earlier rows. If a retry creates a new run, the tables need to be queryable by the batch's current `run_id` for **all** of its rows; see §12.

### 6.6 Iterations
- A batch's files are grouped into **iterations**, zero-based: e.g. 100 files in 50 iterations, `0,0,1,1,2,2,…`.
- `BatchFile.iteration` is the file's iteration. **It is not a retry count**, and retrying keeps it.
- **Parser tables MUST have an `iteration` column.** Each file's dropdown offers "Open iteration N in **{parser}**" links that filter by `iteration` (§8.2).
- **Analysis tables do not need one.** Analyses are filtered by `run_id`/`batch_id` only.

---

## 7. Notes

A collapsible **Notes** section at the bottom of each expanded batch. People post short comments about the batch, and can edit or delete them. It's kept deliberately simple.

### 7.1 Behaviour the backend must support
- **Collapsed by default.** The header shows **"Notes (N)"** using `BatchDetail.note_count`, without fetching the notes.
- **Fetched only when expanded** (`GET …/notes`). Notes are **not polled**. They're re-fetched after each add, edit or delete made from this browser.
- **Oldest first.** Each note shows `author`, relative `created_at` (exact time on hover), and "· edited" if `updated_at` is non-null. The body is shown as written (line breaks preserved) inside a speech bubble.
- **Add:** a "Your name" field plus a comment box, posted with **Post** or Ctrl/⌘+Enter. Both fields are required, and the frontend trims both before sending.
- **Edit:** only the **body** can be edited, inline, with Save or Ctrl/⌘+Enter, and Esc to cancel.
- **Delete:** asks inline, "Delete? Yes / No", then deletes.
- **Anyone can edit or delete any note.** There are no users yet (§11).

### 7.2 Storage model (suggested)
```sql
CREATE TABLE batch_notes (
    id          TEXT PRIMARY KEY,                 -- e.g. uuid4().hex; sent to the frontend as a string
    batch_id    TEXT NOT NULL REFERENCES batches(batch_id) ON DELETE CASCADE,
    author      TEXT NOT NULL,                    -- typed name today; user id/name later (§11)
    body        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NULL                  -- set on every edit, null until then
);
CREATE INDEX batch_notes_batch_created ON batch_notes (batch_id, created_at);
```
`note_count` on `BatchDetail` = `SELECT count(*) FROM batch_notes WHERE batch_id = :id`.

### 7.3 `GET /batches/{batch_id}/notes` — list
**Response** `200`: `BatchNote[]`, **oldest first**. A plain JSON array, not wrapped in an object. `[]` if there are none. `404` if the batch doesn't exist.
```json
[
  {
    "id": "note-1",
    "batch_id": "batch-0417",
    "author": "alice",
    "body": "edge-03 and edge-09 are from the old sensor firmware, re-capture pending.",
    "created_at": "2026-11-10T07:40:00Z",
    "updated_at": null
  }
]
```

### 7.4 `POST /batches/{batch_id}/notes` — add
**Request**
```json
{ "author": "alice", "body": "Re-captured, see batch-0421." }
```
**Response** `201` (or `200`): the created `BatchNote`. `404` if the batch doesn't exist. `422` if `author` or `body` is empty or too long; the toast shows `message`.

### 7.5 `PATCH /batches/{batch_id}/notes/{note_id}` — edit
**Request**
```json
{ "body": "Re-captured, see batch-0422 (not 0421)." }
```
**Response** `200`: the updated `BatchNote`, with `updated_at` set to now. `404` if the batch or note doesn't exist, or the note belongs to another batch. `422` if `body` is empty.

### 7.6 `DELETE /batches/{batch_id}/notes/{note_id}` — delete
**Response** `204`. `404` as above.

### 7.7 Sketch
```python
notes = APIRouter(prefix="/batches/{batch_id}/notes", tags=["batch-notes"])

@notes.get("", response_model=list[BatchNote])
def list_notes(batch_id: str):
    _batch_or_404(batch_id)
    return repo.notes(batch_id, order_by="created_at ASC")

@notes.post("", response_model=BatchNote, status_code=201)
def add_note(batch_id: str, body: NewBatchNote):
    _batch_or_404(batch_id)
    author = current_user_name() or body.author.strip()        # see §11
    return repo.insert_note(batch_id=batch_id, author=author, body=body.body.strip())

@notes.patch("/{note_id}", response_model=BatchNote)
def edit_note(batch_id: str, note_id: str, body: UpdateBatchNote):
    note = repo.note(batch_id, note_id) or _404(note_id)
    return repo.update_note(note.id, body=body.body.strip(), updated_at=utcnow())

@notes.delete("/{note_id}", status_code=204)
def delete_note(batch_id: str, note_id: str):
    repo.note(batch_id, note_id) or _404(note_id)
    repo.delete_note(note_id)
    return Response(status_code=204)
```

---

## 8. Data tables and the "open in Data" links

Several places on the Batches page navigate to the **Data page** with a ready-made SQL query. The Data page loads the query into its SQL editor and **runs it immediately** through the existing `POST /query` endpoint.

### 8.1 URL format the frontend builds
```
/data/{ingest_type}/{table}?sql=<url-encoded SQL>
```
The Data page reads `sql`, runs it once, then removes it from the URL.

### 8.2 Exact SQL the frontend generates

| Where | SQL |
|---|---|
| Pipeline node (parser or analysis), default | `SELECT * FROM {table} WHERE run_id = '{run_id}';` |
| Pipeline node with `filter_by: "batch_id"` | `SELECT * FROM {table} WHERE batch_id = '{batch_id}';` |
| File dropdown → "Open iteration N in {parser}" (parsers only, file must be `PARSED`) | `SELECT * FROM {table} WHERE run_id = '{run_id}' AND iteration = N;` (or `batch_id = …` if that parser has `filter_by: "batch_id"`) |

- `{table}` = `step.table ?? step.name`. It's inserted **unquoted**, so table names MUST be valid unquoted SQL identifiers (letters, digits, underscore). If they aren't, send a valid `table`.
- String values are single-quoted, with `'` escaped as `''`. Numbers are not quoted.
- Every query ends with `;`. `POST /query` MUST accept a trailing semicolon.

### 8.3 Requirements on tables and on `/query`
- **Every pipeline table** (parser and analysis) MUST have a **`run_id`** column, or a **`batch_id`** column if its step uses `filter_by: "batch_id"`.
- **Every parser table** MUST also have an **`iteration`** column.
- **`POST /query`** body is `{"sql": "..."}`. The response is `{ "columns": Column[], "rows": [...], "row_count": int }`, the existing contract. It MUST handle these `SELECT … WHERE … = … [AND …]` queries. Large results SHOULD be capped or paged server-side; the editor has no `LIMIT` in these queries.
- **Data page sidebar:** the URL includes `{ingest_type}`, and the Data page's sidebar loads `GET /datasets/{ingest_type}/tables`. Pipeline tables SHOULD be listed under the batch's `ingest_type` so the sidebar highlights them. The query still runs either way. See §12.

---

## 9. Page behaviour reference

### 9.1 The list
- **Header:** "Batches", plus an **Upload batch** button that goes to `/ingest`.
- **Filter tabs:** All, Active, Needs attention, Completed. Each tab's badge comes from `counts`, and is "–" until the first response arrives.
- **Search box:** debounced by **300 ms**, sent as `q`. Typing resets to page 1.
- **Columns:** Batch ID + ingest-type tag · Title · Owner · Progress · Status · Files · Created.
  - **Progress** is a segmented bar from `file_counts` (parsed / processing / failed / queued / uploaded) with a summary like "11 parsed · 2 failed".
  - **Status** is the derived badge (§4.1).
  - **Files** is `file_count`.
  - **Created** is a relative time.
- **Pagination footer:** only shown when `total > pageSize`. Per-page selector (10/20/50), "21–40 of N", and first/prev/next/last buttons.
- **Empty states:**
  - `counts.all == 0`: "No batches yet. Upload files on the Ingest page."
  - `total == 0` with `q`: "No batches match your search."
  - `total == 0` without `q`: "No batches match this filter."
- **Caching:** each `{page, pageSize, filter, q}` combination is cached separately. The previous page stays visible while the next one loads.

### 9.2 Requests and polling

| What | Request | When |
|---|---|---|
| List | `GET /batches?…` | On load and whenever params change. **Every 3 s while `has_active` is true**. |
| Open batch | `GET /batches/{id}` | When expanded. **Every 3 s while** the batch's file status is `QUEUED`/`PROCESSING` **or** any parser, analysis or graph is `QUEUED`/`PROCESSING`. |
| Notes | `GET /batches/{id}/notes` | Only when the Notes section is expanded, and after each add, edit or delete. **Not polled.** |
| Re-focus | none | Re-fetching on window focus is **off** app-wide. |
| Failures | — | Failed `GET`s are retried twice (React Query default config), except the `?open=` deep-link lookup, which isn't retried. Data stays fresh for 30 s between triggers. |

> Polling is the current design. A Redis-backed WebSocket push of batch and step status changes would remove it later; `services/ws.ts` already exists. That's not required now.

### 9.3 The expanded batch panel
Opening a row expands a panel with these parts, in this order:

1. **Actions** (left column, top to bottom):

   | Button | Shown when | Calls |
   |---|---|---|
   | Share batch | always | none (§10) |
   | Export file list | always | none (§10) |
   | Export graphs | ≥ 1 graph `FINISHED` | `GET /batches/{id}/graphs` (§5.7) |
   | Edit title | always | `PATCH /batches/{id}` (§5.3) |
   | Retry failed (N) | `file_counts.FAILED > 0` | `POST /batches/{id}/retry` (§5.6) |
   | Cancel batch | file status `QUEUED`/`PROCESSING` | `POST /batches/{id}/cancel` (§5.5) |
   | Delete batch | always | `DELETE /batches/{id}` (§5.4) |

   Every action that calls the backend re-fetches the batch and the list on success, and shows a toast. On failure, the toast shows the error's `message` (§1.6).

2. **Details** card: Title, Owner, Batch ID, Ingest type, Source, Parser (free text), Created, Started, Finished, Duration (computed, "… so far" while running), Files (with "· N failed"), Total size, Rows written.

3. **Files** card: count badge and "N failed". A scrollable list, in the order sent. Each row shows a status square, filename, size and status badge. Expanding a row shows:
   - Job ID;
   - **Iteration**;
   - Progress (`PROCESSING` only);
   - Rows written (if not null);
   - Started, Duration;
   - **error** (red box, if any);
   - for `PARSED` files, "Open iteration N in {parser…}" links (§8.2).

4. **Pipeline** card (full width): §6.

5. **Notes** section (full width, collapsible): §7.

### 9.4 Deep links (`?open=<batch_id>`)
- The open batch is kept in the URL (`/batches?open=batch-0417`), so it can be shared, bookmarked and reloaded.
- If that batch isn't in the current page of results, the frontend fetches it with `GET /batches/{id}` and shows it, expanded, in a "Linked batch · not on this page" card above the list. A `404` shows "Couldn't load {id}. It may have been deleted."
- **No extra endpoint is needed.** The backend only has to return a correct `404` for unknown IDs.

---

## 10. Frontend-only features

These need **no backend work**, as long as `GET /batches/{id}` returns the fields listed.

| Feature | What it does | Data it uses |
|---|---|---|
| **Share batch** | Copies `{current page URL}?open={batch_id}` to the clipboard and shows the toast "Link copied". The recipient's page opens it via §9.4. | `batch_id` |
| **Export file list** | Builds a CSV in the browser and downloads it as `{batch_id}-files.csv` with columns `filename, iteration, status, size_bytes, rows_written, error, started_at, finished_at`. | `files[]` |
| **"Open in Data" links** | Builds the SQL in §8.2 and opens the Data page. | `run_id`, `batch_id`, `pipeline` |

---

## 11. Future: users and authentication

The system has **no users or profiles yet**. The contract is designed so that adding them later is mostly a backend change.

- **Notes author:** today the user types a name, the browser remembers it, and the frontend sends it as `author`. Once users exist:
  - the backend takes the author from the session and SHOULD ignore or override the `author` in the body;
  - the frontend passes the signed-in name to `BatchNotes currentUser={...}`, which hides the name field. It still sends `author` (the same name), so keep accepting the field.
  - **Ownership:** at that point only the author (or an admin) should be allowed to edit or delete a note. Return `403` with a readable `message` otherwise.
- **Batch scoping:** `GET /batches` becomes "the caller's batches" (§1.8). `owner` then comes from the user. `counts` and `has_active` must be scoped to the caller too.
- **Auth transport:** all `fetch` calls currently send **no auth header**. If auth uses an `Authorization: Bearer` header, every frontend helper needs updating, **and** the graphs download (§5.7) cannot send that header because it's a browser navigation. Options:
  - **(a)** cookie-based sessions, which work for everything as-is (recommended for simplicity);
  - **(b)** a short-lived signed download URL. The frontend would first call an endpoint that returns the URL, which needs a small frontend change.

---

## 12. Open questions for the backend

These need answers when the backend is built. The frontend works either way, but the behaviour differs.

1. **Data rows on delete:** does `DELETE /batches/{id}` also delete the batch's rows in the parser and analysis tables (by `run_id`/`batch_id`)? The confirmation dialog currently promises only *"removes the batch and its N files."* If rows are deleted too, tell the frontend so the dialog text can be updated.
2. **Which dataset pipeline tables belong to:** are analysis tables registered under the batch's `ingest_type` (so `/data/{ingest_type}/{table}` resolves in the Data page sidebar), or under a different dataset type? If different, add an optional `dataset` field to `PipelineStep`, which needs a small frontend change.
3. **`run_id` after retry:** does a retry reuse the batch's `run_id`? If it creates a new run, the earlier rows (old `run_id`) and the new rows must still both be found by the links. Either keep one `run_id` per batch, or document what changes.
4. **Owner today:** with no users, what goes in `owner`? (The uploader's typed name at ingest, an API-key name, or `null`?)
5. **Title at upload:** titles can be edited here, but the ingest flow doesn't set one. Should `POST /ingest/{type}/batch` accept an optional `title`?

---

## 13. Implementation checklist

**Conventions**
- [ ] Error body `{code, message, detail?}` via exception handlers (§1.6)
- [ ] `POST`/`PATCH` always return a JSON body; `DELETE` returns `204` (§1.5)
- [ ] UTC ISO-8601 timestamps; nullable fields sent as `null` (§1.3–1.4)

**`GET /batches`**
- [ ] `page`, `pageSize` (camelCase alias), `filter`, `q`
- [ ] Newest first; filter + search before paging
- [ ] `total` (matches filter + q), `counts` (all four keys, ignore q/filter/paging), `has_active` (files **or** running steps)
- [ ] Status and filter rules exactly as §4

**`GET /batches/{id}`**
- [ ] All `BatchDetail` fields, including `run_id`, `note_count`, `files[].iteration`, `pipeline`
- [ ] `file_counts`, `file_count`, `total_bytes`, `rows_written`, `started_at`, `finished_at` consistent with `files`
- [ ] Files sorted by iteration
- [ ] `404` for unknown IDs

**Pipeline**
- [ ] Branches of `{parser, analyses[]}`; unique names; `table`/`filter_by` only when they differ from the defaults
- [ ] Never-to-run steps reported as `FAILED`, not `QUEUED`
- [ ] Optional `graphs[]` on analyses when the graph service exists

**Actions**
- [ ] `PATCH /batches/{id}` `{title|null}`
- [ ] `DELETE /batches/{id}` cascades to notes
- [ ] `POST /batches/{id}/cancel` (active files → `FAILED` "Cancelled.", `409` if not active)
- [ ] `POST /batches/{id}/retry` (only `FAILED` → `QUEUED`, keep `iteration`, `409` if none)
- [ ] `GET /batches/{id}/graphs` → zip with `Content-Disposition: attachment`

**Notes**
- [ ] `batch_notes` table with `ON DELETE CASCADE`
- [ ] `GET` (oldest first, plain array), `POST {author, body}`, `PATCH {body}` (sets `updated_at`), `DELETE` (`204`)

**Data**
- [ ] Every pipeline table has `run_id` (or `batch_id` when `filter_by: "batch_id"`)
- [ ] Every parser table has `iteration`
- [ ] `POST /query` runs the §8.2 queries (trailing `;`, quoted strings, unquoted ints)
- [ ] Pipeline tables discoverable under `/datasets/{ingest_type}/tables` (or answer §12.2)
