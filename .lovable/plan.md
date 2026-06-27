# Fix App-Wide Slowness — Phase C Rollout

The earlier read-only audit (`docs/cloud-usage-audit-2026-06-27.md`) already identified the hotspots. The slowness you're now seeing across all pages matches those findings — especially the global StatusBar refetching every 10 seconds, wide `SELECT *` queries, and a few unindexed/unfiltered scans. This plan applies the approved-style fixes in safe batches.

## What I will change (in order)

### Batch C1 — Biggest wins, LOW risk
1. **StatusBar polling (F2)** — global footer currently refetches stock + receivables every ~10s on every page. Raise to 2 min stale, invalidate on Sale/Receipt save. Expected: largest single reduction in cloud reads + fewer background fetches blocking UI.
2. **Customer Master narrow SELECT (F4)** — drop from `SELECT *` (22 cols) to the 9 displayed columns.
3. **Customer Master count mode (F8)** — switch `{count:'exact'}` → `{count:'planned'}` on paginated list.
4. **Sale items LATERAL join (F1)** — remove redundant inner `sales` re-join in `fetchSaleItemsByOrg` callers where org scope is already known.

### Batch C2 — Correctness + cost, LOW risk
5. **Unfiltered `product_variants` scan (F6)** — add explicit `.eq('organization_id', orgId)` to the caller(s).
6. **Unfiltered `customer_product_prices` scan (F7)** — same fix.
7. **`fixMissingMrp` UPDATE loop (F10)** — collapse 1,000 single-row updates into one `WHERE id = ANY($ids)` statement.

### Batch C3 — MED risk, isolated paths
8. **2.6s products+variants+size_groups embed (F3)** — locate caller and route through paginated RPC.
9. **POS variant-lookup audit (F9)** — verify all callers use the indexed `lookupBarcodeStock` path.

### Batch C4 — Optional polish
10. Confirm 250 ms debounce on Inventory / Product Master search.
11. Lift `staleTime: 0` → 30 s on `DailyCashierReport` and `CustomerReconciliation`.

## Verification after each batch
- `pg_stat_statements` mean/total ms before vs after for the targeted query.
- Manual smoke: open StatusBar pages, Customer Master, POS, Sales Invoice.
- No business-logic changes — only SELECT shape, filters, stale times, and one UPDATE batching.

## Out of scope
- No RLS, no formula changes, no schema migrations beyond what each fix needs.
- Already-fixed items (Sales Dashboard, Settings, Sale Order Dashboard, Product Master pagination, trigram indexes) are not touched.

## Technical notes
- StatusBar fix: change `STALE_FREQUENT` → `STALE_REFERENCE` in the StatusBar query options, then add `queryClient.invalidateQueries({ queryKey: ['stock-summary'] })` inside `useDashboardInvalidation` save paths.
- F6/F7 callers will be located via `rg` for the raw query patterns; they are RLS-only scans today.
- F10 is the `fixMissingMrp` repair utility — already has an equivalence test (`test/money/fixMissingMrpEquivalence.test.ts`) to guard the batching change.

Reply **"Approve C1"** (or list which batches) and I'll apply them in that order, reporting before/after numbers after each.