# Cloud usage minimization — zero structural change

Goal: cut Supabase reads + Realtime events without touching any business logic, formulas, UI layout, or schema. No risk of loading or connection issues — every change is a cache window extension or a duplicate-listener removal that falls back to existing fetch paths.

## Changes (all safe, all reversible)

### 1. Stop double-fetching where Realtime already invalidates
These three pages have BOTH a polling `refetchInterval` AND a Postgres realtime channel that already invalidates the same query — the poll is pure waste.

- `src/components/FloatingWhatsAppInbox.tsx` → drop `refetchInterval` (line 41). Realtime channel (lines 48–83) already keeps badge fresh. Keep `staleTime: 30_000`.
- `src/pages/WhatsAppInbox.tsx` → already `refetchInterval: false` ✅ (confirm both queries stay false).
- `src/components/WhatsAppMessageNotifier.tsx` → confirm no companion poll exists.

Effect: removes ~1 query/min per active org from WhatsApp widget. No UX change — realtime is faster than the poll it replaces.

### 2. Lengthen tab-return windows on read-heavy dashboards
Bump `STALE_DASHBOARD_TAB_RETURN` from 30 s → 120 s in `src/lib/queryStaleTimes.ts`. This only affects window-tab re-entry within 2 min (cache hit instead of refetch). Any save/invalidation still forces fresh data via existing `invalidateQueries` calls. No first-load behavior changes.

### 3. Raise global default staleTime cautiously
In `src/App.tsx` `QueryClient` defaults: `staleTime: 30_000` → `60_000`. Only affects refetch-on-mount within 60 s. All search/filter/barcode/pagination queries are already pinned to `STALE_LIVE`/`STALE_PAGINATED` in `queryStaleTimes.ts`, so live data stays live. `placeholderData: keepPreviousData` + `notifyOnChangeProps: ["data","error"]` already prevent flicker.

### 4. Disable cloud-usage diagnostics fetch wrapper in production builds
`src/lib/cloudUsageDiagnostics.ts` is initialized in `App.tsx` (line 295). It only attaches when `localStorage.ezzy_cloud_usage === '1'`, but the init call still runs on every boot. Guard `initCloudUsageDiagnostics()` behind `import.meta.env.DEV || localStorage.ezzy_cloud_usage === '1'`. Pure overhead removal; no functional change.

### 5. POS quick polls — already at 5 min, leave alone
`src/pages/POSSales.tsx` line 617 already uses `useVisibilityRefetch(300000)` (5 min, paused when hidden). No change.

### 6. Tier-based refresh — confirm `free` tier orgs poll = false
Already implemented in `useTierBasedRefresh`. No change. Document for user that upgrading to a paid tier increases reads by design.

## What is NOT touched
- No SQL, no migrations, no RLS, no RPC, no schema.
- No layout, no component tree, no route changes.
- No business formulas (balance, stock, GST, FIFO).
- No POS / Sales Invoice / Purchase Entry behavior.
- No edge functions, no WhatsApp send/receive, no print templates.
- No realtime channels removed (only the redundant polls beside them).

## Expected impact
On a busy org with WhatsApp inbox visible all day: removes ~1,500 polled reads/day (10 h × 6 polls/hr × 25 orgs scaled). Tab-return cache extension cuts dashboard re-mount fetches roughly in half during the 30–120 s window. No user-perceptible change because data invalidates on every save/receive.

## Verification (no code, run in browser)
1. `localStorage.setItem('ezzy_cloud_usage','1'); location.reload();`
2. Run the baseline journey from `docs/cloud-usage-baseline.md`.
3. `window.__ezzyCloudUsage.printReport()` — compare request count vs. previous baseline.
4. Disable diagnostics afterward.

## Files to edit (4 total)
1. `src/components/FloatingWhatsAppInbox.tsx`
2. `src/lib/queryStaleTimes.ts`
3. `src/App.tsx`
4. (optional) `src/lib/cloudUsageDiagnostics.ts` — only the init guard

Approve to implement.
