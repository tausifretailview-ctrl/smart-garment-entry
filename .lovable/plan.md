## Goal

When you minimize the window, switch to another browser tab, or click another ERP tab and come back to an Inventory page (Stock Report, Item-wise Stock, Stock Ageing, Stock Adjustment, Product Tracking, Item-wise Sales, etc.), the page should stay stable — no skeleton flash, no refetch — exactly like POS Dashboard and Sales Invoice Dashboard.

## Why it happens today

I traced the difference between the screens that are stable (POS / Sales / Sale Returns / Purchase Bill Dashboard / Product Dashboard / Purchase Return Dashboard) and the screens that flash a skeleton (the rest of the Inventory module):

1. **Stable screens** all spread `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` (`src/lib/dashboardQueryOptions.ts`) onto every `useQuery`. That preset sets:
   - `refetchOnWindowFocus: false`
   - `refetchOnMount: false`
   - `refetchOnReconnect: false`
   - `staleTime: STALE_DASHBOARD_TAB_RETURN`
   - `placeholderData: keepPreviousData`

2. **Inventory report screens that flash** only set a short `staleTime` (30–60 s) and rely on React Query defaults. Defaults are `refetchOnWindowFocus: true` + `refetchOnMount: true`, so:
   - On tab/window return, AuthContext's `visibilitychange` handler revalidates the session and calls `setSession(...)` whenever the access_token rotates. That re-renders all consumers, which re-runs effects, which re-evaluates queries. Anything past `staleTime` refetches → `isLoading`/`isFetching` flips true → skeleton flashes for 1–3 s.
   - Same thing happens when the OS suspends the tab for a while.

3. POS / Sales feel stable because their dashboards already opt out of all three refetch triggers via the shared preset.

## Files to fix

Apply `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` to every `useQuery` in these files, and switch any `loading = isLoading` flags to `loading = isLoading && data.length === 0` (so the skeleton only ever appears on the first cold load, not while a background refetch is in flight):

- `src/pages/StockReport.tsx` (2 queries — global totals, filter options + the main list)
- `src/pages/ItemWiseStockReport.tsx` (filter options, stockData, supplierMap)
- `src/pages/StockAgeingReport.tsx` (rawData)
- `src/pages/StockAdjustment.tsx` (rawVariants)
- `src/pages/ProductTrackingReport.tsx` (filter options, queryResult)
- `src/pages/ItemWiseSalesReport.tsx` (filterOptionsData, saleItems, rpcSummary — REPORT_CACHE already covers two, normalize the rest)
- `src/pages/PriceHistoryReport.tsx` (audit all `useQuery` calls)
- `src/pages/BarcodePrinting.tsx` (audit `useQuery` calls)

For each query: keep its own `staleTime` if it is intentionally short, but force `refetchOnWindowFocus: false`, `refetchOnMount: false`, `refetchOnReconnect: false`, and `placeholderData: keepPreviousData` so previous rows stay visible during any background refetch.

## Auth tab-resume polish (root-cause guard)

In `src/contexts/AuthContext.tsx` `handleVisibilityChange` (around line 356):

- Today `applyResumedSession` calls `setSession` whenever `access_token` changes, even though `user.id` is the same. Every silent token rotation therefore re-renders every consumer of `useAuth`.
- Change it so that when `user.id` is unchanged we only update `sessionRef.current` (which is what the Supabase client and refresh logic actually need) and do **not** call `setSession` / `setUser`. We still call `setSession` when the user identity changes or when we recover from a lost session.
- Net effect: silent token rotations on tab resume stop cascading re-renders into OrgLayout → all dashboards (Inventory included) no longer get a fresh effect/query pass on every tab return.

## TabCachedPages cross-check (no code change required)

`src/components/TabCachedPages.tsx` already keeps `purchase-bill-dashboard`, `purchase-bills`, `purchase-orders`, `purchase-return-dashboard`, `purchase-returns`, `product-dashboard`, `products`, `barcode-printing`, `stock-settlement`, `bulk-product-update` mounted on web. After the query-options fix above, the remaining stock/ageing/tracking report pages (which mount via `<Outlet>`) will also stop flashing because their queries no longer refetch on focus/mount.

## Acceptance checks

1. Open Stock Report, switch to another browser tab for 30 s, return → table stays populated, no skeleton, no loading spinner.
2. Open Item-wise Stock Report, click another ERP window tab, click back → table is instant, no flash.
3. Open Purchase Bill Dashboard with data loaded, minimize the window for 2 min, restore → list is unchanged, no skeleton.
4. POS Dashboard / Sales Invoice Dashboard behavior is unchanged (still stable).
5. After saving a new purchase bill, clicking Refresh in the dashboard still pulls fresh data (manual refetch path untouched).
