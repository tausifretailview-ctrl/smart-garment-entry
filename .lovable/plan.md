## What I found (audit)

Your Electron app is configured **as a thin shell that loads the live website** (`https://app.inventoryshop.in`) — it does NOT bundle the React build locally.

```text
Windows .exe (Electron)
        │
        └── BrowserWindow.loadURL("https://app.inventoryshop.in")
                        │
                        └── same React app users get in Chrome
```

Implications:
1. Every "slow / loading" issue you feel in the desktop app = same as the website. Electron itself adds <100 ms.
2. First open is bound by network (CDN + Supabase round-trips). No local bundle = nothing cached on disk between launches except what the browser cache holds.
3. Phase 1 + 2 fixes already done (RLS parallel-safe, indexes, 30 s staleTime, 20 s tab budget) directly help the desktop app — no Electron change needed for those.

What's actually wrong on the Electron side:
- `backgroundThrottling` not disabled → when minimized to tray, timers/queries throttle, first un-minimize feels frozen.
- No HTTP disk-cache size set → Chromium default (~80 MB) gets evicted fast on a busy ERP; cold reloads re-download chunks.
- `zoomFactor: 0.8` is applied **after** first paint (in `did-finish-load`) → layout re-flows once, visible jank.
- `loadURL` runs immediately with no readiness check; if internet is briefly slow on launch, retry waits 1.5 s before first retry.
- No `session.preconnect` to `app.inventoryshop.in` / Supabase → TLS handshake adds 200–400 ms on cold start.
- Old `loadRetryCount` still increments on harmless reloads (SPA navigations that mis-fire `did-fail-load`).
- `electron:build` uses `electron-builder` — fine for your own machine, but the dev-server sandbox can't actually package `.exe` (7-zip dynamic-link issue). Build must run on your Windows box. I'll document that, not change it.

## Plan (Electron-only, no business-logic changes)

### Step 1 — main.cjs perf tuning (single file, ~15 lines)
- Add `app.commandLine.appendSwitch('disable-renderer-backgrounding')` and `('disable-background-timer-throttling')` before `app.whenReady`.
- In `webPreferences`, set `backgroundThrottling: false`.
- Set Chromium disk cache to 512 MB: `app.commandLine.appendSwitch('disk-cache-size', '536870912')`.
- Move `setZoomFactor(0.8)` from `did-finish-load` into `webPreferences.zoomFactor` only (already there) — drop the duplicate set so no re-flow.
- Preconnect on app ready: `session.defaultSession.preconnect({ url: PROD_URL, numSockets: 2 })` and same for the Supabase REST origin.
- First retry delay 1.5 s → 400 ms (only the first retry; later ones keep current back-off).
- Guard `reloadMainWindow` so SPA history changes don't count toward `MAX_LOAD_RETRIES`.

### Step 2 — Splash polish
- Keep the existing navy `backgroundColor: '#F5F7FA'` (already prevents white flash).
- Inject a tiny "Loading EzzyERP…" centered text via `loadURL`'s `data:` fallback only if `did-fail-load` fires twice in a row — so a flaky network shows status instead of a blank window.

### Step 3 — Build & runtime checklist (docs only)
Add `electron/README.md` with:
- Exact Windows build command (`npm run electron:build:win`) and required Node version.
- How auto-update works (already wired to GitHub releases via `electron-updater`).
- "Run from source" command for local QA: `npm run electron:dev`.
- Note: packaging must run on a real Windows machine — Lovable sandbox can't produce `.exe`.

### Step 4 — Verify
After Step 1+2 are in:
- Run `npm run electron:dev` locally on Windows.
- Cold launch → first paint should be ~30 – 40 % faster (preconnect + cache + no re-zoom reflow).
- Minimize to tray for 5 min, restore → no frozen UI (background throttling off).
- Kill internet briefly → app retries quickly and shows readable fallback instead of blank.

## Explicitly NOT changing
- React / Vite bundle, business logic, RLS, search, print templates, dashboard layout.
- Switching to a bundled offline app (would break auto-update flow and add complexity — your call if you ever want it).
- `vite.config.ts` `base` path — irrelevant because the app loads from a remote URL, not `file://`.
- Edge functions, DB schema, types.ts, client.ts.

## What this solves
- "Slow loading" on cold start of the .exe → preconnect + bigger disk cache.
- "App freezes after sitting in tray" → background throttling off.
- "Blank window when internet hiccups" → faster first retry + readable fallback.
- One-time layout jitter at launch → single zoom factor, no post-load re-zoom.

Approve and I'll implement Step 1 + Step 2 + Step 3 in one batch.