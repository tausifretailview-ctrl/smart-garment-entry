# Plan: Reduce Lovable Cloud Usage

Goal: cut daily database reads significantly. **Search hooks/queries will NOT be touched** (`useCustomerSearch`, `productSearch`, `multiTokenSearch`, POS hybrid search, dropdown/typeahead queries). Only background polling, stale-times, and realtime listeners are tuned.

## Where the reads come from (audit findings)

1. **Background polling (`refetchInterval`)** — fires every X minutes per open tab, per org, even when nothing changed.
2. **Short `staleTime`** on dashboard widgets → refetch on remount/route switch.
3. **Realtime `postgres_changes` subscriptions** — each subscribed table emits reads from the websocket layer.
4. **Multi-tab amplification** — POS, WhatsApp Inbox, Dashboard all poll independently per tab.

## Changes

### 1. Tighten tier-based polling (`src/hooks/useTierBasedRefresh.tsx`)
Double current intervals; free tier already disabled.

```
enterprise/professional: fast 5m → 10m, medium 10m → 20m, slow 15m → 30m
basic:                   fast 10m → 20m, medium 15m → 30m, slow 30m → 60m
```

Add a hard guard: if `document.visibilityState !== 'visible'` for >5 min, return `false` (already pauses on hide; this extends the pause).

### 2. Disable always-on polling on mobile owner dashboards
`src/components/mobile/OwnerDashboard.tsx` and `src/components/mobile/MobileDashboard.tsx` currently poll `fast`/`medium`. Switch to **manual refresh + pull-to-refresh only** (set `refetchInterval: false`), keep existing `staleTime` so the data shows instantly from cache.

### 3. POS polling
`src/pages/POSSales.tsx` polls `posRefetchInterval = 5 min` on two queries (lines 1118, 1327). Increase to **15 min** and gate behind `document.visibilityState === 'visible'` (the visibility hook already does this — keep it, just raise the base).

### 4. Floating widgets
- `src/components/FloatingPOSReports.tsx` line 83: `30s` polling when open → **2 min**.
- `src/components/FloatingWhatsAppInbox.tsx`: already `medium` — leave, but only mount the query when the panel is `open`.

### 5. WhatsApp Inbox page
`src/pages/WhatsAppInbox.tsx` has **2 polling queries (`fast` = 10 min after step 1) + 2 realtime subscriptions** on the same tables. That is double coverage. Keep realtime (cheap, push-based), set both `refetchInterval: false`. Realtime already invalidates the cache.

### 6. WhatsApp API settings
`src/components/WhatsAppAPISettings.tsx` polls `fast` for connection status. Settings pages don't need polling — switch to **on-mount + manual "Check status" button** (`refetchInterval: false`).

### 7. Daily Sale Analysis
`src/pages/DailySaleAnalysis.tsx` line 363: `isToday ? 5min : false` → **15 min** (analytics page, not real-time critical).

### 8. Raise default `staleTime` in `useOrgQuery`
`src/hooks/useOrgQuery.ts` default `30_000` → **120_000** (2 min). This single change reduces re-mount refetches across dozens of org-scoped queries. Pages that need fresher data already override.

### 9. Dashboard widget cache
`src/pages/Index.tsx` dashboard queries: bump `staleTime` from 5–10 min → **15 min**; they already have `refetchInterval: false` and a manual refresh button.

### 10. Realtime audit
Keep only:
- `useUserPermissions` (required for live access revocation — already correct)
- WhatsApp Inbox messages (push beats polling)

No other `postgres_changes` listeners found, so nothing to remove.

### 11. Tab-visibility timer cleanup
`src/contexts/AuthContext.tsx` line 329 periodic check — confirm interval ≥ 5 min and pause when hidden. Adjust if shorter.

## Out of scope (explicitly NOT changed)

- `useCustomerSearch.tsx` — all 4 search queries untouched.
- `productSearch.ts`, `multiTokenSearch.ts`, POS dropdown search RPCs.
- Any `SearchableSelect` or typeahead query.
- Business logic, RLS, RPCs, schema.

## Expected impact

Largest wins: steps 1, 2, 5, 8. Combined, background reads per active tab should drop ~60–75% in basic/pro tiers and ~100% of background polling on free tier (already in place; widget mounts also reduced). User-triggered reads (search, opening a screen, refreshing) are unchanged, so perceived behavior stays the same.

## Files to edit

- `src/hooks/useTierBasedRefresh.tsx`
- `src/hooks/useOrgQuery.ts`
- `src/components/mobile/OwnerDashboard.tsx`
- `src/components/mobile/MobileDashboard.tsx`
- `src/pages/POSSales.tsx` (only the `posRefetchInterval` constant)
- `src/components/FloatingPOSReports.tsx`
- `src/components/FloatingWhatsAppInbox.tsx`
- `src/components/WhatsAppAPISettings.tsx`
- `src/pages/WhatsAppInbox.tsx`
- `src/pages/DailySaleAnalysis.tsx`
- `src/pages/Index.tsx`
- `src/contexts/AuthContext.tsx` (verify only)

No migrations, no edge functions, no search files.
