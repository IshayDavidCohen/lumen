# Lumen — Cursor Fix Prompts

Run these as **separate Cursor tasks**, in order. Each is scoped to avoid cross-contamination. Wait for one to finish before starting the next.

---

## Prompt 1: Refactor Theme System (Light-as-Default)

> **Context files:** `src/index.css`, `src/hooks/useTheme.ts`, `index.html`, and every file that uses `dark:` / `light:` prefixes.
>
> **Task:** Refactor the theme system so that light mode is the default and only `dark:` overrides are needed. Right now every Tailwind class is duplicated with both `dark:` and `light:` prefixes (e.g. `dark:bg-zinc-950 light:bg-white`). This roughly doubles the class volume per element.
>
> Do the following:
>
> 1. In `index.css`, remove the `@custom-variant light` line. Keep `@custom-variant dark`. Add base (light) styles to the default layer — the existing `html.light body` block already sets `bg-zinc-50 text-zinc-900`, keep that as the unprefixed default.
>
> 2. In `index.html`, change `<html lang="en" class="dark">` to `<html lang="en">` (no class — let useTheme apply it). Change `<body>` to use the light defaults: `class="bg-zinc-50 text-zinc-900 antialiased"`.
>
> 3. In `useTheme.ts`, fix the flash-of-wrong-theme: add a synchronous inline `<script>` in `index.html` (before the React script) that reads `localStorage.getItem("lumen-theme")` and sets the class on `<html>` immediately, so the correct theme is applied before any paint. Remove the `body.style.backgroundColor` / `body.style.color` manipulation from `applyTheme` — let CSS handle it entirely via the class on `<html>`.
>
> 4. Across ALL components, replace every `light:X dark:Y` pair with just `X dark:Y`. For example:
>    - `dark:border-zinc-800 light:border-zinc-200` → `border-zinc-200 dark:border-zinc-800`
>    - `dark:bg-zinc-950 light:bg-white` → `bg-white dark:bg-zinc-950`
>    - `dark:text-zinc-100 light:text-zinc-900` → `text-zinc-900 dark:text-zinc-100`
>
>    Do this for every component file: `NavBar.tsx`, `FileUpload.tsx`, `StatusBadge.tsx`, `DataTable.tsx`, `IngestHistory.tsx`, `Toast.tsx`, all page files in `app/(app)/`, and any others.
>
> 5. In `uploadStatus.ts`, remove the entire `STATUS_CONFIG_LIGHT` export. The dark status config classes (like `bg-blue-500/10`, `text-blue-400`) work in both modes because they use opacity and fixed color values. If any component references `STATUS_CONFIG_LIGHT`, remove that reference.
>
> **Do NOT change:** any Radix UI primitive usage, the component logic, the Zustand store shape, or the services layer. This is purely a CSS/class refactor.
>
> **Verify:** after the change, `grep -r "light:" src/` should return zero results.

---

## Prompt 2: Make Monaco Editor Theme-Aware

> **Context files:** `src/app/(app)/query/page.tsx`, `src/hooks/useTheme.ts`
>
> **Task:** The Monaco editor currently hardcodes `theme="vs-dark"` regardless of the app theme. Make it respond to the theme toggle.
>
> 1. In the query page, import `useThemeStore` from `@/hooks/useTheme`.
> 2. Read the current theme: `const { theme } = useThemeStore();`
> 3. Change the Monaco `theme` prop from the hardcoded `"vs-dark"` to `theme === "dark" ? "vs-dark" : "light"`.
>
> That's it. Don't change anything else in the query page. Don't modify the Monaco options object, the editor height, or the Suspense fallback.

---

## Prompt 3: Add AbortController Support to the API Layer

> **Context files:** `src/services/api.ts`, `src/services/datasets.ts`, `src/services/query.ts`
>
> **Task:** The service layer has no cancellation support. Add `AbortSignal` passthrough so callers can cancel in-flight requests.
>
> 1. In `api.ts`:
>    - Add an optional `signal?: AbortSignal` parameter to `apiGet`, `apiPost`, and `apiUpload`.
>    - Pass `signal` into the `fetch()` options: `{ signal, ...otherOptions }`.
>    - For `apiUpload`: when `onProgress` is used (the XHR path), store the `xhr` reference and listen to the signal. If the signal is provided, add: `signal.addEventListener("abort", () => xhr.abort())`. Check `signal.aborted` before starting.
>    - In the catch block, detect `AbortError`: if `error instanceof DOMException && error.name === "AbortError"`, throw a new `ApiError` with code `"UPLOAD_FAILED"` and message `"Request was cancelled"`. Do not wrap it as `NETWORK_ERROR`.
>
> 2. In `datasets.ts`:
>    - Add optional `signal?: AbortSignal` to `uploadFile`, `uploadBatch`, `getDatasetTypes`, `getTables`, `getTableData`.
>    - Pass it through to the underlying `apiGet`/`apiUpload` calls.
>    - For mock functions, don't pass signal (mocks don't need cancellation).
>
> 3. In `query.ts`:
>    - Add optional `signal?: AbortSignal` to `executeQuery`.
>    - Pass it through to `apiPost`.
>
> **Do NOT** change any hook or component in this prompt — we'll wire up the signals in the next prompt. Just get the plumbing in place.
>
> **Type safety:** No `any` types. The signal parameter should be typed as `AbortSignal | undefined`.

---

## Prompt 4: Wire Up Cancellation in Hooks and Pages

> **Context files:** `src/hooks/useFileUpload.ts`, `src/app/(app)/query/page.tsx`, `src/app/(app)/data/page.tsx`
>
> **Task:** Now that the service layer accepts `AbortSignal`, wire up cancellation so navigating away or unmounting cleans up in-flight requests.
>
> 1. In `useFileUpload.ts`:
>    - Add a `Map<string, AbortController>` ref (like the existing `wsConnections` ref) called `uploadControllers`.
>    - In `uploadSingleFile`, create an `AbortController`, store it in the map keyed by `trackedFile.id`, and pass `controller.signal` to `uploadFile()`.
>    - On successful upload (after receiving the job_id), remove the controller from the map.
>    - In `removeTrackedFile`, call `controller.abort()` if one exists for that file ID, then delete it.
>    - In retry logic, abort any existing controller before creating a new one.
>
> 2. In the query page (`query/page.tsx`):
>    - Add an `AbortController` ref: `const abortRef = useRef<AbortController | null>(null)`.
>    - In `handleExecute`, abort any previous controller, create a new one, pass `abortRef.current.signal` to `executeQuery()`.
>    - On unmount (via `useEffect` cleanup), abort the current controller.
>    - In the catch block, if the error message is "Request was cancelled", don't show a toast — the user navigated away intentionally.
>
> 3. In the data page (`data/page.tsx`):
>    - The data page uses TanStack Query for fetching table data. TanStack Query already handles cancellation via its built-in `signal` — verify that the `queryFn` passes `signal` to `getTableData()`. If it doesn't, add it: `queryFn: ({ signal }) => getTableData({ ...params, signal })`. The `getTableData` function in `datasets.ts` should already accept `signal` from Prompt 3.
>
> **Do NOT** touch the services layer (that was done in Prompt 3). Keep all existing error handling — just add the cancellation path alongside it.

---

## Prompt 5: Move `lucide-react` to Production Dependencies

> **Context file:** `package.json`
>
> **Task:** `lucide-react` is currently listed in `devDependencies` but it's imported by production components (`NavBar.tsx`, `FileUpload.tsx`, `IngestHistory.tsx`, query page, data page). Move it to `dependencies`.
>
> In `package.json`, remove `"lucide-react": "^1.11.0"` from `devDependencies` and add it to `dependencies` with the same version. That's the entire change.

---

## Notes

- **Query history eviction** — I originally flagged this but `useQueryHistory.ts` already has `MAX_ENTRIES = 100` with truncation. No fix needed.
- **Monaco worker bundling** — this is a separate, larger task (configure `vite-plugin-monaco-editor` or manually set `MonacoEnvironment.getWorkerUrl`). Don't bundle it with these fixes. It's an air-gap deployment concern that deserves its own prompt once you're ready for production builds.
- Run the prompts in order because Prompt 4 depends on the type signatures added in Prompt 3, and all subsequent prompts assume the theme refactor from Prompt 1 is complete.