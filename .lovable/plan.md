

## Fix: Sales Invoice Dashboard Slow Loading + Edit Invoice Issues

### Problems Found

**1. Dashboard fetches ALL invoices with ALL sale_items on every load (lines 361-405)**
The query uses `select('*, sale_items (*)')` in a loop fetching ALL invoices (no limit, no server-side pagination). For a business with thousands of invoices, this downloads the entire history including every line item — massive payload causing the slow load and the skeleton loading state shown in the screenshot.

**2. No `staleTime` or `refetchOnWindowFocus: false` on the main invoices query**
Every tab switch or navigation triggers a full re-fetch of all invoices + all line items.

**3. `searchQuery` is in the query key but filtering happens client-side (line 362)**
Typing in search causes the entire dataset to re-fetch from the database even though the search is done in JavaScript. This is unnecessary and slow.

**4. SalesInvoice.tsx edit flow doesn't invalidate the dashboard query key**
After updating an invoice in `SalesInvoice.tsx`, no cache invalidation happens for `['invoices']` — the `useDashboardInvalidation` hook only invalidates `dashboard-stats`, `sales-trend`, etc. but NOT the `['invoices']` key. So when user returns to dashboard, data may be stale until a manual refresh.

**5. Summary stats calculated from ALL fetched data**
`summaryStats` (line 645-658) iterates the entire `filteredInvoices` array including `sale_items` nested loops for qty — compounded by the large dataset.

### Fix Plan

**Phase 1: Server-side pagination + lazy line items (biggest impact)**

In `SalesInvoiceDashboard.tsx`:
- Default period filter to `monthly` (This Month) instead of `all` — fast first load
- Move search, date, payment status, and delivery filters to server-side (like PurchaseBillDashboard already does)
- Use `select(...)` with explicit columns, NO `sale_items(*)` in the list query — use `total_qty` column instead
- Add `{ count: 'exact' }` for proper pagination totals
- Add `staleTime: 30000` and `refetchOnWindowFocus: false`
- Add debounced search (300ms) before triggering server query
- Remove `searchQuery` from query key, use `debouncedSearch` instead
- Line items are already fetched on-demand in the expand subrow — no change needed there

**Phase 2: Dashboard invalidation after invoice edit/create**

In `SalesInvoice.tsx`:
- After save (both create and update), invalidate `['invoices']` query key so dashboard refreshes
- Add `useQueryClient` import and call `queryClient.invalidateQueries({ queryKey: ['invoices'] })` after save

In `useDashboardInvalidation.tsx`:
- Add `['invoices']` to `invalidateSales()` so all sales mutations also refresh the dashboard list

**Phase 3: Server-side summary stats**

Replace client-side summary computation with a server-side RPC or use the existing `get_sales_invoice_dashboard_stats` RPC if it exists, passing filter params. If no RPC exists, compute stats from the paginated result set (current page only) or create a lightweight count/sum query.

### Files to Modify
- `src/pages/SalesInvoiceDashboard.tsx` — Server-side pagination, lazy items, default monthly filter, debounced search, staleTime
- `src/pages/SalesInvoice.tsx` — Invalidate `['invoices']` after save/update  
- `src/hooks/useDashboardInvalidation.tsx` — Add `['invoices']` to `invalidateSales()`

### Expected Impact
- Dashboard loads in <1 second (50 rows, no line items) vs 5-15 seconds (all invoices + all items)
- Edit invoice navigates correctly and dashboard refreshes on return
- Tab switches don't re-fetch

