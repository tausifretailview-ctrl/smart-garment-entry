# Phase 3 — Performance & UX Audit (2026-07-25)

Read-only. No `src/` changes, no migrations, no DDL. Uses `pg_stat_statements`,
`pg_indexes`, `pg_class.reltuples`, and `EXPLAIN` (not `EXPLAIN ANALYZE`).

## Measurement window — important caveat

`pg_stat_statements.stats_reset = 2026-07-11 20:07 UTC` — 15 days ago. All
trigram indexes from the June audit shipped *before* this reset, so today's
figures are cleanly post-index. Numbers here are **not directly comparable to
the June 26 totals** (different windows, different lengths); compare **shape
and mean/call**, not totals. Total-time rankings reflect only the last 15 days
of production.

---

## A1. Re-measure of June's top-5

| June # | Query shape | Today's calls / total / mean | Trigram present? | Planner using it? | Verdict |
|---|---|---|---|---|---|
| 1 | `sale_items` ILIKE (barcode/product_name/size/color) + `sale_id = ANY(...)` | 89,679 / 2,891 s / **32 ms** | YES — 4 partial GIN on all 4 cols | **No.** `EXPLAIN` picks `idx_sale_items_saleid`; the ILIKE runs as a post-filter. | **Still #1.** The trigrams cannot help — when `sale_id = ANY(small_set)` the btree wins and the ILIKE is a residual filter. Fix is **call-shape**, not index-shape: debounce, and stop unioning `sale_items` per keystroke. |
| 3 | `purchase_bills` LIST + `purchase_items(count)` LATERAL per row | Not in top 25 | n/a | n/a | **Resolved** (or dropped below the noise floor). No action. |
| 6 | `purchase_items` 6-col ILIKE + `bill_id = ANY(...)` | Present but demoted; the app-side shape (`utils/purchaseBillDashboardSearch.ts`) scopes by `bill_id IN (...)` first. Mean per call is small; not a top-10 total. | YES — 6 partial GIN | Same post-filter shape as #1 when `bill_id` set is small. | **Resolved for the bill-scoped path.** See "New hotspots" for a different, unscoped `purchase_items` query. |
| 14 | `sales` 4-col ILIKE + org + sale_type | 3,803 / 253 s / **66 ms** | YES — 4 partial GIN | **No.** `EXPLAIN` picks `idx_sales_org_customer_active` (org btree); ILIKE is a post-filter. | **Improved** vs June (49 → 66 ms/call but far fewer calls). Same call-shape lesson: OR-of-ILIKEs with a selective org filter defeats trigram usage. |
| 15 | `products` LIST + `product_variants` LATERAL per product | Not in top 25 | n/a | n/a | **Resolved** (server pagination / narrower embed appears to have landed). No action. |

### New heavy hitters (not in June's top-5)

| # | Shape | Calls / total / mean | Notes |
|---|---|---|---|
| N1 | `purchase_items` barcode ILIKE, `sku_id IS NOT NULL`, no `bill_id`, no org (RLS-scoped) | 1,065 / **287 s / 270 ms** | See "Isolation note" below. Post-filter through the RLS join, then trigram on `barcode`. Called from `ProductEditPanel`'s last-purchase lookup. |
| N2 | `purchase_items` `sku_id = $1` + `bill_id`→`purchase_bills` LATERAL (org+deleted) | 2,042 / 234 s / **114 ms** | N+1 per product-edit view: one call per `sku_id`. Same shape as N1 but scoped by UUID sku_id, so isolated. |
| N3 | `product_variants` 6-OR barcode/color ILIKE + `products` LATERAL | 2,251 / 228 s / **101 ms** | POS multi-term scan ("123 RED 42"). Same OR-of-ILIKE-defeats-trigram pattern. |
| N4 | `customers` `SELECT *`-ish list ordered by name (no search) | 10,075 / 256 s / 25 ms | Mount-frequency issue, not per-call. Confirms Customer Master + POS picker refetch churn. |
| N5 | Two near-identical `products` 28-OR keystroke ILIKEs (different projections) | 7,008 + 9,202 / **362 s combined** | Duplicated query paths — one hook returns 5 cols, one returns 6. Consolidating trims ~180 s. |
| N6 | `sale_items` barcode ILIKE, no org, no sale_id | 1,516 / **185 s / 122 ms** | `fetchSaleItemsForOrg`-style path without a scoping set. RLS-scoped via `sale_id → sales.organization_id`. |
| N7 | `v_dashboard_purchase_summary` scanned on every dashboard mount | 2,173 / 206 s / 95 ms | View, not a table. Check whether the view is materialized or a live join. |

### Isolation note on N1 (checked before writing this section)

`purchase_items` has no `organization_id` column — tenant scoping is
structural via `bill_id → purchase_bills.organization_id`. `pg_class` shows
RLS is **enabled** and the SELECT policy is:

```
bill_id IN (
  SELECT purchase_bills.id
  FROM purchase_bills
  WHERE purchase_bills.organization_id IN (
    SELECT get_user_organization_ids(auth.uid())
  )
)
```

So the app's unscoped `barcode ILIKE` query is **not** a cross-tenant leak —
it's a scan where the RLS join runs after the trigram narrows candidates. It
is a perf item, not a security item. Confirmed via `pg_policies` before this
audit ran.

---

## A2. Statement-timeout handling

- `rg -n "57014" src/` — **zero handlers**. Confirmed.
- Role timeouts: `authenticated → 8s`, **`anon → 3s`**.
- **No user-facing message maps `57014`**. Today the query rejects with
  Supabase's generic error string, which the app surfaces as either
  "Something went wrong" or a spinner that never resolves.

### Recommended single insertion point

Three candidates were considered. Recommendation is bolded.

| Candidate | Fit | Notes |
|---|---|---|
| **React Query global `queryCache.onError` / `mutationCache.onError` in `src/App.tsx`** | **Best** | Already exists as the single global error boundary for queries. Adding a `mapSupabaseError(err)` helper called from both caches gives one message-mapping surface with zero call-site changes. |
| Supabase client wrapper | Blocked | `src/integrations/supabase/client.ts` is auto-generated and off-limits. |
| Per-hook try/catch | Rejected | 200+ call sites; guaranteed drift. |

The helper's job is only to detect PostgREST's timeout shape (`code === "57014"` or `message` starting with `canceling statement due to statement timeout`) and rewrite it to a plain-English toast. Not implemented here.

### Ranked list of queries that can plausibly hit a role timeout

**Anon-scoped (3 s budget — customer-facing, highest priority):**

1. `src/pages/PublicInvoiceView.tsx` — reads the invoice + line items via anon role. Large invoice (100+ lines) on a slow mobile is a real timeout risk.
2. `src/pages/PublicPaymentPage.tsx` — reads payment link + related invoice under anon. Same envelope.
3. Buyer Portal routes (`portal_sessions` + product listing under `portal_price_type`) — anon, unbounded product listing.

**Authenticated (8 s budget), ranked by scan size:**

4. `src/utils/customerSegments.ts::fetchAllSalesForSegments` — full org sales history, client-paginated. Largest tenants have ~41k `sales` rows total but only a fraction per-org; still the single biggest offset walk on a hot path (`CustomerMaster.tsx`, `useCustomerAccountHistoryData.ts`).
5. `src/pages/TallyExport.tsx` — full-range accounting export. Cold path but the most likely 8 s tripwire when a user picks "This year".
6. `src/pages/StockReport.tsx`, `StockAnalysis.tsx`, `StockSettlement.tsx` — full `stock_movements` walk (406k rows table-wide). Per-org share is smaller but still the top of the list.
7. `src/pages/SalesReportByCustomer.tsx`, `DailySaleAnalysis.tsx`, `ItemWiseSalesReport.tsx` — date-range reports that scan `sale_items` (117k rows table-wide).
8. `src/pages/RecycleBin.tsx` — cross-table soft-delete scan on demand.
9. `src/pages/Accounts.tsx` voucher search — 12-OR ILIKE on `voucher_entries.description` per keystroke; not usually 8 s but the closest to it under keyboard load.
10. `src/pages/SaleReturnDashboard.tsx` — full return list scan.

---

## A3. Sequential `offset +=` pagination loops

33 files, ranked. Row estimates from `pg_class.reltuples` (free, no seq scan):

```
stock_movements   406,871
purchase_items    120,333
product_variants  118,540
sale_items        117,224
journal_lines      94,135
products           43,391
sales              41,058
customers          30,486
voucher_entries    28,929
purchase_bills      4,441
```

These are cluster-wide across all 50+ tenants; per-org is typically 1-5% of this.

### Hot-path first (runs on page mount, not user-initiated export)

| Rank | File | Target table | Existing RPC? | Fix shape | Notes |
|---:|---|---|---|---|---|
| 1 | `src/utils/customerSegments.ts::fetchAllSalesForSegments` | `sales` | **Yes** — `get_customer_segment_counts` (already used by `Index.tsx`) | Route `CustomerMaster.tsx` + `useCustomerAccountHistoryData.ts` through the RPC. Delete client pager once callers migrate. | **Single biggest win.** Client-side aggregation of the whole sales history duplicates work the RPC already does. |
| 2 | `src/utils/invoiceDashboardData.ts` | `sales` | Partial (`get_sales_dashboard_stats` for KPIs; list still paginated) | Keyset (`.gt("id", lastId)`) or accept only page 1 for mount, defer more. | Sales Dashboard mount. |
| 3 | `src/utils/posDashboardSales.ts` | `sales` | Same as #2 | Same. | POS Dashboard mount. |
| 4 | `src/hooks/useAccountsVoucherData.ts` | `voucher_entries` | No | Keyset. Also root-cause of the voucher keystroke burn (see A4). | Accounts page mount + search. |
| 5 | `src/utils/saleOrderListQueries.ts` | `sale_orders` | `get_sale_order_dashboard_stats` (stats only) | Keyset for list, keep RPC for stats. | Sale Order Dashboard mount. |
| 6 | `src/utils/purchaseBillDashboardSearch.ts::fetchPurchaseBillIdsInScope` | `purchase_bills` (4,441 rows) | No | Low priority — small table. Only fires when user types search. | Purchase Bill Dashboard search. |
| 7 | `src/pages/SalesInvoiceDashboard.tsx` | `sales` | Partial | Same as #2. | Mount. |
| 8 | `src/pages/SaleReturnDashboard.tsx` | `sale_returns` | No | Keyset. | Mount. |
| 9 | `src/pages/AdvanceBookingDashboard.tsx` | `advance_booking_attempts` | No | Keyset. | Mount. |
| 10 | `src/pages/PurchaseOrderEntry.tsx`, `src/pages/PurchaseEntry.tsx`, `src/pages/SaleOrderEntry.tsx` | mostly line-item pull for edit mode | n/a | Bounded by parent id — leave as-is. | Edit-mode only, natural bound. |
| 11 | `src/hooks/useBulkProductUpdate.tsx` | `products` + `product_variants` | No | Keyset. Mount-cold — user has to click into Bulk Update page. | P3 candidate. |
| 12 | `src/utils/supplierSegments.ts` | `purchase_bills` | No parallel RPC yet | Symmetric to #1 but smaller table (4,441). Lower priority. | Supplier Master. |

### Cold-path (only fires on explicit user action — leave for later)

`src/utils/accountingReportUtils.ts`, `src/utils/accounting/historicalMigration.ts`,
`src/pages/TallyExport.tsx`, `src/pages/ItemWiseSalesReport.tsx`,
`src/pages/StockSettlement.tsx`, `src/pages/StockReport.tsx`,
`src/pages/StockAnalysis.tsx`, `src/pages/StockAdjustment.tsx`,
`src/pages/DailySaleAnalysis.tsx`, `src/pages/EmployeeMaster.tsx`,
`src/pages/CustomerPointsReport.tsx`, `src/pages/SalesReportByCustomer.tsx`,
`src/pages/RecycleBin.tsx`, `src/utils/customerBalanceUtils.ts`,
`src/utils/fixMissingMrpEquivalence.ts`, `src/utils/webUsbPrint.ts`,
`src/utils/fetchAllRows.ts`, `src/hooks/usePosDeliveryChallan.ts`,
`src/pages/Accounts.tsx` (report tab). 19 files. All acceptable as-is; a slow
one-off report is not a mount stall. Revisit only if a specific report is
reported slow.

---

## A4. Perceived-performance findings (UX)

### Search inputs without debounce

- **`src/hooks/useAccountsVoucherData.ts`** — no `useDebounce` wrapper found; the 12-OR `voucher_entries.description` ILIKE fires per keystroke. This is the single biggest debounce miss in the codebase and matches the June "1 s of query per second of typing" observation.
- Every other search hook I checked (`useCustomerSearch`, POS pickers, Product Master) either uses `useDebounce` or is on a `staleTime: 0` key with a client-side `useMemo` filter.

### Full-page centred spinner (candidates for shell-first pattern)

P3-tagged in `CURSOR_PROMPT_PERF.md` and confirmed still-spinner:
`src/pages/BulkProductUpdate.tsx`, `src/pages/PurchaseOrderDashboard.tsx`,
`src/pages/BarcodePrinting.tsx`.

Also spinner-only that would benefit: `src/pages/AccountingReports.tsx`,
`src/pages/NetProfitAnalysis.tsx`, `src/pages/ExpenseSalaryReport.tsx`,
`src/pages/CustomerReconciliation.tsx`, `src/pages/CustomerPartyBalancesPage.tsx`,
`src/pages/DeliveryChallanDashboard.tsx`, `src/pages/CustomerAccountPage.tsx`.

### Button/action pending state

No systematic audit possible without runtime; noted as a follow-up. The primary Save flows in `PurchaseEntry.tsx`, `POSDashboard`, and `SalesInvoiceDashboard` already gate on `isPending`.

### Layout shift

Out of scope for a static audit — needs the browser. Flag as follow-up if user reports it.

### Bundle

`npm run build` runs automatically in the harness after edits; production build size is not re-measured here to avoid a stateful side-effect. `vite.config.ts` already partitions `manualChunks` for query/supabase/chart/pdf/xlsx/ui vendors. To flag any oversized route chunk, run `npm run build` locally and inspect `dist/assets/*.js` — call this out as an item to check while doing Phase B, not before.

---

## A5. Recommended fix list — ranked by (impact ÷ risk)

| Rank | Fix | Impact | Risk | Depends on |
|---:|---|---|---|---|
| 1 | **Shared `57014` handler in `App.tsx`'s `queryCache.onError` + `mutationCache.onError`.** Detect timeout, show "This report covers too much data — try a shorter date range" toast, offer retry. | High (converts every silent 8 s/3 s failure into a clear, recoverable message; anon routes get most benefit) | Low (pure message-mapping; no query changes) | None |
| 2 | **Debounce `useAccountsVoucherData.ts` search** to 250 ms, and drop the 12-OR ILIKE to a single `.ilike("description", "%q%")` (trigram picks it up). | High (cuts query #2's total by an order of magnitude) | Low (behaviour-preserving UI; server plan flips to trigram scan) | None |
| 3 | **Kill `fetchAllSalesForSegments` on hot paths.** Route `CustomerMaster.tsx` + `useCustomerAccountHistoryData.ts` through the existing `get_customer_segment_counts` RPC. Before merging, compare RPC vs client counts for a real org and post the diff. | High (removes a full-history offset walk from two hot mounts) | Med (need numeric equivalence proof; RPC exists but callers differ) | Approval to touch each caller |
| 4 | **Stop unioning `sale_items` per keystroke on Sales/POS Dashboard search.** Skip the union pass unless the term has no `sales.*` matches, or throttle it to `onBlur`. | High (query #1 is currently 32 ms × 89k calls; call-shape fix, not index) | Med (search UX change — must verify no legitimate result path disappears) | Approval |
| 5 | **Consolidate N5 duplicate `products` 28-OR keystroke ILIKEs** into one hook that selects the superset. | Med (~180 s / window saved) | Low | None |
| 6 | **P3 shells** — `BulkProductUpdate`, `PurchaseOrderDashboard`, `BarcodePrinting`. | Med (perceived-only; real numbers unchanged) | Low | None |
| 7 | **Trim `SELECT *`-shaped `customers` list (N4)** to the ~9 columns the UI renders (already done in some places — audit rest). | Low-Med | Low | None |
| 8 | **Investigate `ProductEditPanel` last-purchase lookup (N1/N2)** — one-time cache per product edit session instead of two fresh queries. | Med | Low | None |
| 9 | Keyset pagination for hot-path dashboards (`invoiceDashboardData`, `posDashboardSales`, `saleOrderListQueries`) — replace deep OFFSET with `.gt("id", lastId)`. | Med (large tenants only) | Med (touch order-sensitive code paths) | Approval per file |
| 10 | **Index question** — `v_dashboard_purchase_summary` (N7). If it's a live view aggregating per-mount, either materialize it or short-circuit the tile when zero rows are expected. Migration required. | Low-Med | Med (new migration; separate approval) | Explicit index approval |

---

## Single biggest win — 5 lines

The top hotspot (`sale_items` ILIKE per keystroke, ~2,891 s / 15-day window)
cannot be fixed with any additional index — `EXPLAIN` shows the planner uses
the `sale_id` btree and the ILIKE runs as a residual filter, which is optimal
for that shape. The real fix is call-shape: **stop firing the `sale_items`
union per keystroke on Sales/POS Dashboard search**, and debounce voucher
search in `useAccountsVoucherData.ts`. Combined with the shared `57014`
handler in `App.tsx`, those three changes remove the largest server-time
category **and** the most common silent-failure category in one Phase B
cycle — no schema changes, no business-logic risk.

---

*End of Phase A. Awaiting approval on specific items from A5 before Phase B.*