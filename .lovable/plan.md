## What you're seeing

In the video, when you click away to another ERP window tab (Customers / Accounts) and come back to **Purchase Bills**, the KPI cards stay but the bills table flashes a skeleton for ~1 second. POS Dashboard and Sales Invoice Dashboard do **not** do this — they stay static.

All three dashboards are kept mounted in `TabCachedPages` (`pos-dashboard`, `sales-invoice-dashboard`, `purchase-bill-dashboard` are all in `EXPLICIT_PROTECTED_TAB_PATHS`), so the component is never unmounted on tab change. All three also already spread `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` (`refetchOnMount:false`, `refetchOnWindowFocus:false`, `refetchOnReconnect:false`, `placeholderData: keepPreviousData`). So the cache itself is fine.

## Root cause — the `loading` flag, not the query

The skeleton is driven by the local `loading` boolean that each dashboard passes to `ERPTable isLoading={loading}`. The Purchase Bills version is more fragile than the POS/Sales version.

**POS Dashboard** (`src/pages/POSDashboard.tsx:640`) — stable:
```ts
const loading = salesQueryLoading && paginatedSales.length === 0;
```
Once rows are on screen, `paginatedSales.length > 0`, so `loading` can never flip back to `true` — even if React Query momentarily considers the query "loading" again (auth token rotate, org context re-render, enable→disable→enable cycle, brief gcTime hiccup).

**Sales Invoice Dashboard** (`src/pages/SalesInvoiceDashboard.tsx:802`) — also stable thanks to `keepPreviousData`: `dashboardPage` stays defined after the first load, so `isDashboardInitialLoad` stays `false`.

**Purchase Bill Dashboard** (`src/pages/PurchaseBillDashboard.tsx:1288-1292`) — fragile:
```ts
const isDashboardInitialLoad =
  purchaseQueriesEnabled && billsQueryLoading && billsQueryData === undefined;
const loading = isDashboardInitialLoad && !billsQueryError;
```
This depends on **three** moving pieces simultaneously. The one that bites us on tab return is `purchaseQueriesEnabled`, which is:
```ts
const purchaseQueriesEnabled = !!currentOrganization?.id && purchaseFiltersReady;
```
On tab return the AuthContext `visibilitychange` handler revalidates the session and (per `.lovable/plan.md`) currently calls `setSession` on every silent token rotation. That re-renders `OrganizationProvider` consumers. If `currentOrganization` is momentarily replaced by a new reference where `id` is still the same — but more importantly, when React Query sees the query toggled (because of any re-render inside a `<Suspense>` parent or an effect downstream), it can flip `isLoading` for one render before the cached `placeholderData` takes effect. With Sales/POS the guard `… && paginatedX.length === 0` masks that one-render flip; in Purchase, `billsQueryData === undefined` is only briefly true at that boundary and `loading` flashes `true` → ERPTable renders skeleton rows → user sees the flash.

The 404s in the console (`get_invoice_dashboard_stats`, `_with_items_atomic`) are unrelated — they're missing/legacy RPC fallbacks and don't affect the Purchase Bills list query.

Net root cause in one line: **Purchase Bill Dashboard's `loading` flag is computed from `billsQueryData === undefined` instead of `paginatedBills.length === 0`, so it briefly returns `true` after tab return even though the cached rows are still in memory.**

## Fix — align Purchase with the POS/Sales pattern

One small, surgical change. Keep the existing `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` (already correct). Only adjust the local `loading` derivation.

`src/pages/PurchaseBillDashboard.tsx` around line 1288:

```ts
// Before
const isDashboardInitialLoad =
  purchaseQueriesEnabled && billsQueryLoading && billsQueryData === undefined;
const isDashboardBackgroundRefresh =
  (billsQueryFetching || purchaseSummaryFetching) && !isDashboardInitialLoad;
const loading = isDashboardInitialLoad && !billsQueryError;

// After (mirrors POSDashboard line 640)
const isDashboardInitialLoad =
  purchaseQueriesEnabled && billsQueryLoading && bills.length === 0;
const isDashboardBackgroundRefresh =
  (billsQueryFetching || purchaseSummaryFetching) && !isDashboardInitialLoad;
const loading = isDashboardInitialLoad && !billsQueryError;
```

The same `bills.length === 0` guard already exists for mobile (line 1885 reads `isDashboardInitialLoad` for `<Skeleton>` cards), so the mobile path keeps working correctly — first cold load still shows skeletons because `bills` is empty then.

No other files need to change. `BackgroundSyncBadge` (already mounted in StatusBar) will still give the subtle "Syncing…" hint during the silent background refetch if one happens.

## Acceptance checks

1. Open Purchase Bills with data loaded → switch to Customers tab → switch back → table stays populated, no skeleton flash.
2. Switch browser to another window for 30s → return to Purchase Bills → no flash.
3. First time you click Purchase Bills after login (empty cache) → skeleton still appears until rows load (unchanged behavior).
4. Save a new purchase bill → table refreshes via `invalidatePurchases()` → still works (manual invalidation path untouched).
5. POS Dashboard and Sales Invoice Dashboard behavior is unchanged.

## Out of scope (worth a follow-up but not required for this fix)

- The auth tab-resume polish in `.lovable/plan.md` (stop calling `setSession` on silent token rotation when `user.id` is unchanged). That would prevent the underlying re-render that exposes the flag fragility on many other inventory pages too. Happy to do this as a separate change if you want, but the one-line fix above is enough to make Purchase Bills behave exactly like POS/Sales for the scenario in your video.
