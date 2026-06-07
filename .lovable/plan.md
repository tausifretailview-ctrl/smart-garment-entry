# Stop unwanted auto-reload (web + Windows app)

## What the user is seeing
The Windows app (and sometimes the web app) shows the blue spinner and then "auto-refreshes" by itself — usually after the machine has been idle / asleep, or right after first open. The runtime log confirms it: `Module load timed out` is being thrown, a React error boundary catches it, and that boundary calls `window.location.reload()`. After the reload the same lazy chunk may time out again, so it looks like the app is constantly refreshing on its own.

Most of the auto-reload code has already been disabled (Electron `main.cjs`, `App.tsx` unhandled-rejection handler, `chunkLoadRetry.ts`, `TabPaneErrorBoundary`). **Two boundaries still auto-reload silently** — those are the remaining cause.

## Root cause (still active)

1. `src/components/RootErrorBoundary.tsx` — `componentDidCatch` calls `window.location.reload()` when the error is a chunk-load / "Module load timed out" error (guarded by `chunk_reload_count < 1`, but `App.tsx` clears that counter after 5 s, so it triggers again on the next idle wake).
2. `src/components/ErrorBoundary.tsx` — same pattern in `componentDidCatch`. This is the top-level boundary wrapping `<App />` in `main.tsx`, so it fires before anything else can catch the error.

Result: any transient dynamic-import failure (sleep / wake, brief network blip, CDN hiccup) → boundary catches → silent full reload.

## Change

Make both boundaries behave like the rest of the app: **never auto-reload**, just render the existing recovery UI with manual "Refresh" / "Try Again" buttons. The user stays on the current page with their data intact and decides whether to refresh.

### Files to edit

- `src/components/RootErrorBoundary.tsx`
  - In `componentDidCatch`, remove the `if (isChunkLoadError(error)) { … window.location.reload() }` block. Keep the `console.error` so we can still see crashes.
  - Keep the recovery UI (`Refresh Page`, `Try Again`, `Go to Dashboard`) — those are user-initiated and stay.

- `src/components/ErrorBoundary.tsx`
  - In `componentDidCatch`, remove the `isChunkLoadError` auto-reload branch. Just log the error.
  - Keep all existing buttons (`Try Again`, `Clear Cache & Reload`, `Go to Home`) — manual only.

- `src/App.tsx`
  - Remove the `setTimeout(() => sessionStorage.removeItem("chunk_reload_count"), 5000)` effect — with no auto-reload code remaining, the counter is dead and the timer just adds noise. Replace with a one-time cleanup on mount: `sessionStorage.removeItem("chunk_reload_count")`.

### What stays the same (intentionally)

- Electron `main.cjs` — already no auto-reload; the "Unresponsive" dialog still asks the user before reloading. ✅
- `chunkLoadRetry.ts` — still retries the dynamic import 3× with backoff before surfacing the error to the boundary. ✅
- All `window.location.reload()` calls behind user buttons (`OrgAuth`, `OrganizationSetup`, `ProductDashboard` after stock import, `useClearCache`, `MobileErrorBoundary` "Clear cache & retry", `SalesmanLayout`, etc.) — these only run when the user explicitly clicks them. ✅
- Suspense fallbacks and `TabPaneErrorBoundary` — already manual. ✅

## Expected behaviour after the change

- Idle wake / brief network blip → at worst the user sees the "Something went wrong / This tab failed to load" panel with a **Retry** and **Refresh** button. No silent reload. No lost form / cart / bill state.
- A genuinely broken deploy → user still has a one-click Refresh, plus the existing "Clear Cache & Reload" path.
- No database, RLS, or backend changes. UI-only.

## Verification

1. Open `/demo/accounts` in the preview, leave the tab inactive for several minutes, come back — page should remain as-is, no spinner / reload.
2. In DevTools console, run `throw new Error("Module load timed out")` inside a child component (or temporarily simulate by adding `throw` in a lazy page) — should render the error panel, not reload.
3. Click "Refresh Page" in the panel → reloads as expected.
4. `rg -n "location\.reload" src/components/RootErrorBoundary.tsx src/components/ErrorBoundary.tsx` should show only the button `onClick={() => window.location.reload()}` handlers, no `componentDidCatch` reloads.
