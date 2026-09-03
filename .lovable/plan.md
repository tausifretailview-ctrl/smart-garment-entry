# App speed, query timeouts and cloud usage — remediation plan

## What the measurements show (read today, live database)

Backend capacity is fine: database up, memory 66%, connections 35/90, pool 1/400, disk 28%, size 1.18 GB. **No instance resize is needed** — the cost is in query shape and request volume, not hardware.

Top time consumers (total server time since stats reset):

| Query | Calls | Mean | Total |
|---|---|---|---|
| `sale_items` line-item search (ILIKE on barcode/name/size/color + `sale_id IN (...)`) | 181,036 | 38 ms | **113 min** |
| `sale_items` fetch by sale ids (qty, mrp) | 28,922 | 86 ms | 41 min |
| `sales` header search (4-column ILIKE + exact count) | 15,088 | 99 ms | 25 min |
| `customers` search / list | 104,701 | ~22 ms | 38 min |
| `v_dashboard_stock_summary` (StatusBar tile) | 33,458 | 34 ms | 19 min |
| `v_dashboard_purchase_summary` | 11,285 | 75 ms (max 2.97 s) | 14 min |
| `purchase_items` barcode ILIKE + bill join | 2,043 | **410 ms** (max 2.7 s) | 14 min |
| `products` search with 28 OR'd ILIKEs | 40,334 | 22 ms (max 1.66 s) | 15 min |

Confirmed structural causes:

1. **`sale_items` has no `organization_id` column** (verified). Every line-item search must first resolve a list of sale ids, then ILIKE across the whole tenant-shared table. That is why it is both the most-called and most expensive statement.
2. **The dashboard views aggregate every organization, then filter.** `v_dashboard_stock_summary` groups all variants of all tenants and `v_dashboard_purchase_summary` groups all bills of all tenants; the `organization_id = ?` filter is applied to the grouped output, so one shop's status bar pays for every shop's data. That is the 2.9 s worst case.
3. **Partial vs unfiltered index pairs are both hot** (Appendix B, 2026-09-02). Do **not** drop `idx_sale_items_sale` / `saleid`, `idx_purchase_items_bill` / `billid`, `idx_purchase_items_sku` / `sku_id`, or `idx_product_variants_org` / `organization_id`. Recycle Bin and include-deleted paths use the unfiltered copies. See `docs/phase-5-index-hygiene-2026-09.md`.
4. **4.53 million rolled-back transactions since boot** — abnormally high. Cause is unknown and must be identified before it is treated as noise.
5. Exact-count pagination (`pgrst_source_count`) on `sales` search doubles the work of every search page.

## Plan

### Phase 1 — Measure the rollback storm (no changes)
Identify what is rolling back 4.5 M transactions: sample failing statements, constraint violations and retried writes from statement stats and logs, grouped by table. Report findings before touching anything else. If it is a real failure loop it is likely also a correctness bug.

### Phase 2 — Dashboard summary views (largest easy win)
Replace both org-wide aggregate views with organization-scoped `SECURITY DEFINER` RPCs that apply `organization_id = p_org` *inside* the aggregation, backed by existing composite indexes. StatusBar and StatsChartsSection switch to the RPCs; caching tiers stay as they are. Expected: 34 ms → low single-digit ms, and the 2.9 s purchase spike disappears.

### Phase 3 — Line-item search
Add `organization_id` to `sale_items`, backfill from the parent sale, keep it in sync via trigger, and add a composite trigram index scoped by org. Replace the ILIKE-over-sale-id-list pattern in POS/Sales dashboard search with a single org-scoped search RPC bounded by date. Expected: the 181 K-call statement collapses to a fraction of its cost and per-keystroke latency drops.

### Phase 4 — Search shapes
- `products`: replace the 28-way OR ILIKE with one trigram search RPC.
- `purchase_items` barcode: use exact / prefix match instead of `%barcode%` (410 ms mean today).
- `sales` search: switch to planned/estimated count instead of exact count on every page.

### Phase 5 — Index hygiene
**Keep all eight.** Appendix B `idx_scan` (2026-09-02) shows both sides of every partial-vs-unfiltered pair are used. Do not DROP. Decision: `docs/phase-5-index-hygiene-2026-09.md`. Re-sample: `scripts/phase-5-keep-indexes.sql`.

### Phase 6 — Cloud usage and loading
**Client + CI done** (`docs/phase-6-cloud-usage-loading-2026-09.md`). OrgLayout attributes every org route; Quick Payments overlays a separate bucket; `copyJson()` is the paste format. Every tab-cache path maps to a named load shell; cold nav never silences Suspense; `destinationsWithNoWatchdog() === []`.

Authenticated Slow-3G request counts still need a signed-in shop capture in `docs/cloud-usage-baseline.md` (no tenant credentials in this environment). Phases 3–4 SQL is not on production yet, so StatusBar RPC names in a live capture may still show the old views until Lovable applies those migrations.

### Phase 7 — StatusBar stock_qty
Replace `get_dashboard_stock_summary` aggregates of legacy `product_variants.current_stock` with authoritative `stock_qty`. StatusBar already reads `total_stock_qty` from the RPC; output columns stay the same. Client barcode stock lookup prefers `stock_qty` (zero is a real quantity). See `docs/phase-7-stock-qty-statusbar-2026-09.md`.

## Technical notes
- No money logic, no schema semantics, no RLS relaxation. New RPCs get explicit `search_path = public`, `EXECUTE` granted to `authenticated` only, and are revoked from `PUBLIC`/`anon` per the existing DDL trigger.
- The `sale_items.organization_id` backfill runs in batches and is validated by comparing counts against the parent `sales` rows before the trigger is trusted.
- Each phase is verified with `EXPLAIN (ANALYZE, BUFFERS)` before and after, plus a re-run of `slow_queries`.

## Verification
1. Slow-query table re-ranked after each phase; the four headline statements must drop in mean and total time.
2. POS dashboard search, customer search and barcode scan return identical rows to today.
3. StatusBar stock/due figures byte-identical before and after Phase 2.
4. No new statement-timeout (57014) errors in a week of production logs.
