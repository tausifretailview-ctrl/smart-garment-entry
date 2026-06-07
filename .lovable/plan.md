## Scope
Web browser / PWA only. No changes to Electron desktop behavior, no changes to printing logic (jsPDF, browser print, thermal CSS, barcode layout). QZ removal stays as-is.

## Findings (web PWA)
The "Taking longer than expected — Retry tab / Refresh app" screen in the screenshot comes from `TabCachedPages` when a lazy page chunk does not resolve before its timeout. On web/PWA the slowness is amplified by three things added recently:

1. **Heavy post-login prefetch waterfall** — `OrgLayout` calls `prefetchPostLoginCriticalPages()` + `prefetchPostLoginIdlePages()` right after org sync. Together these warm 40+ heavy page chunks (POS, dashboards, all reports, accounts, settings, barcode-printing, etc.) over the network, competing with the user's actual click.
2. **All open tabs mounted in browser** — `TabCachedPages` mounts every tab in the saved tab bar (up to 8), each pulling its own chunk + initial data queries on first visit. On a fresh PWA load that means many parallel module fetches before the visible tab finishes.
3. **Aggressive 8s timeout on non-heavy tabs** — `TAB_LOAD_TIMEOUT_MS = 8_000` is too tight for PWA cold-start on slow shop Wi-Fi, so users see the error screen even though the chunk is still downloading.

Secondary: no service worker is registered for app-shell caching, so every cold load re-downloads all chunks from the network.

## Plan (web/PWA only — guarded by `!isElectronShell()`)

1. **Stop the post-login prefetch storm on web**
   - In `OrgLayout`, on web only: prefetch just the active route + the dashboard. Drop the call to `prefetchPostLoginIdlePages()` (40+ admin/report chunks) and trim `prefetchPostLoginCriticalPages()` to the 3-4 modules a cashier actually opens first (POS Sales, POS Dashboard, Sales Invoice Dashboard, Stock Report).
   - Keep Electron path unchanged.

2. **Lazy-mount hidden tabs in browser**
   - In `TabCachedPages`, on web only: mount the active tab immediately; mount other open tabs only when the user clicks them (mirrors the existing Electron behavior). Keep state preserved via the existing scroll cache + tab metadata in localStorage so it still feels like Tally tabs.
   - Protected working screens (POS Sales, bill entry, product entry) stay mounted once visited.

3. **Increase the tab-load timeout window**
   - Raise `TAB_LOAD_TIMEOUT_MS` from 8s to 20s and `HEAVY_TAB_LOAD_TIMEOUT_MS` from 20s to 45s.
   - Show a small inline "Still loading…" spinner with progress dots after 8s, and only swap to the "Retry tab / Refresh app" card after the real timeout. Avoids the false-alarm screen on slow PWA networks.

4. **Reduce duplicate prefetch effects in `TabCachedPages`**
   - Web only: drop the dashboard + product-dashboard auto-pre-mount effects (lines 356–404). They are the biggest cause of the hidden waterfall. Keep the `prefetchTabPage` warm calls (they only queue downloads), just don't force-mount the React tree.

5. **Wider prefetch backoff**
   - In `tabPageRegistry.prefetchTabPagesIdle`, raise the `requestIdleCallback` timeout from 5s to 12s and gate the prefetch on `navigator.connection.effectiveType !== "slow-2g" | "2g"` (already imported via `useNetworkStatus`). On slow links, skip background prefetch entirely.

6. **Optional polish (no behavior change for printing)**
   - Add a small "Loading…" hint at the top of `TabPageFallback` showing the tab name so users see "Loading POS Sales…" instead of a bare spinner — reduces "the app froze" panic.

7. **Verification**
   - Open preview in a fresh browser session, hard-reload `/` → first paint < ~3s, only the visible tab's chunk requested initially.
   - Click between Sales / Purchase / Reports → each tab loads on click, no "Taking longer than expected" within 8–10s on average broadband.
   - Throttle DevTools to "Fast 3G" → tab still loads, fallback card only appears after 20s.
   - Confirm console has no QZ / `localhost` / `wss://` errors and no double `prefetchTabPage` waterfall.
   - Printing (POS receipt, A4 invoice, barcode) untouched and works as today.

## Technical notes
- All branches guarded with `if (!isElectronShell())` so the Windows app path is byte-identical to current behavior.
- No new dependencies, no service worker added (that is a separate decision the user can ask for later if they want offline support).
- Files expected to change: `src/components/OrgLayout.tsx`, `src/components/TabCachedPages.tsx`, `src/lib/tabPageRegistry.ts`, `src/lib/chunkLoadRetry.ts`. No DB, no edge functions, no backend.