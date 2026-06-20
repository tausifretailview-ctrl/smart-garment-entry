
# DB performance — Phase 0 + Phase 1 (measure only)

## Phase 0 — baseline

- `pg_stat_statements` is enabled (`track=top`, loaded in `shared_preload_libraries`).
- `pg_stat_statements_reset()` is not callable with our role, so we used the **current accumulated snapshot** as the baseline. The window reflects normal multi-org traffic up to now.
- No schema/data changes made in this phase.

## Phase 1 — top hotspots

Times in ms. "Source" is the screen/RPC inferred from the query shape.

| # | Table / shape | calls | total ms | mean ms | source guess | class |
|---|---|---:|---:|---:|---|---|
| 1 | `sale_items` ILIKE(barcode/product_name/size/color) AND `sale_id = ANY(...)` AND `deleted_at IS NULL` | 7,456 | 215,353 | 28.9 | Sales list page — embedded item search via PostgREST | **b — frequency + already optimal plan** |
| 2 | `purchase_bills` list, org+deleted, LEFT JOIN LATERAL `purchase_items` count, ORDER BY bill_date DESC | 1,488 | 171,997 | 115.6 | Purchase Bills list | **a/d — embed pattern, see below** |
| 3 | `UPDATE purchase_items SET mrp = ... WHERE id=$ AND (mrp IS NULL OR mrp=0)` | 1,000 | 148,702 | 148.7 | App-side backfill loop | **b — call-frequency, app code issue** |
| 4 | `voucher_entries` 12× ILIKE description + org + voucher_type + reference_type ANY, ORDER BY created_at DESC | 1,740 | 74,990 | 43.1 | Accounts/Payments search | **d — uses idx_voucher_entries_ref_type_id, already optimal** |
| 5 | `purchase_items WHERE sku_id=$1` | 315 | 39,349 | 124.9 | Inventory SKU lookup | **d — idx_purchase_items_sku exists; mean inflated by occasional cold cache, total is small in absolute terms** |
| 6 | `sale_items WHERE sale_id = ANY(...) AND deleted_at IS NULL` | 1,311 | 37,178 | 28.4 | Sales detail/embed | **b — frequency** |
| 7 | `sale_items` JOIN LATERAL sales, ORDER BY sale_items.id ASC, no org filter on sale_items | 175 | 26,344 | 150.5 | Item-wise report | **a — see candidate B** |
| 8 | `purchase_bills` slim list, org+deleted | 1,440 | 24,197 | 16.8 | Purchase dashboard KPI | **b — frequency, plan already uses idx_purchase_bills_org_date_deleted** |
| 9 | `purchase_items` ILIKE(name/brand/barcode/style/category/color) AND `bill_id = ANY(...)` | 228 | 23,563 | 103.3 | Purchase list embedded search | **b — same shape as #1, residual filter on bill-scoped rows** |
| 10 | `sale_orders` + LATERAL items, org+deleted ORDER BY created_at DESC | 21 | 22,854 | **1,088** | Sale Orders list | **a — see candidate C** |
| 11 | `product_variants` org+deleted+barcode ILIKE | 808 | 18,586 | 23.0 | Barcode lookup | **d — idx_product_variants_barcode_trgm exists** |
| 12 | `v_dashboard_stock_summary` org filter | 664 | 16,766 | 25.2 | Dashboard | **c — view, refresh-pattern candidate** |
| 13 | `customers` ILIKE name/phone/email + org | 824 | 16,510 | 20.0 | Customer search | **d — trigram indexes present** |
| 14 | `product_variants` barcode=/ILIKE + org+active+deleted | 562 | 15,024 | 26.7 | POS barcode | **d** |
| 15 | `customers` org+deleted ORDER BY customer_name | 845 | 14,961 | 17.7 | Customer list | **d — idx_customers_org_name covers** |
| 16 | `sale_items WHERE variant_id=$1` (315 calls, 12.9s) | 315 | 12,855 | 40.8 | Stock card / variant detail | **d — idx_sale_items_variant_id exists, plan confirmed** |
| 17 | `sales WHERE id=$1` | 10,496 | 12,489 | 1.2 | Per-bill fetch | **b — frequency, cache opportunity** |
| 18 | `sale_order_items WHERE variant_id=$1` | 315 | 7,389 | 23.5 | Stock card | **a — see candidate A (CONFIRMED missing index)** |
| 19 | `customers WHERE id=$1` | 10,343 | 5,725 | 0.55 | Per-row customer fetch | **b — frequency, cache opportunity** |

Tables: `sale_items` 95k, `product_variants` 100k, `purchase_items` 103k, `sale_order_items` 40k, `sales` 34k, `customers` 30k, `voucher_entries` 27k, `purchase_bills` 3.5k, `sale_orders` 1.3k.

## EXPLAIN ANALYZE — candidates that need a real plan

### Candidate A — `sale_order_items WHERE variant_id=$1` (CONFIRMED missing index)

```
Seq Scan on sale_order_items  (actual 507ms, hit=904)
  Filter: variant_id = '...'  Rows Removed by Filter: 40100
```

No index on `sale_order_items.variant_id`. Compare to `sale_items.variant_id` which has an index and plans an Index Scan in 0.08 ms.

### Candidate B — `sale_items ... ORDER BY id ASC` item-wise report (175 calls, mean 150 ms)

Query has NO `organization_id` on `sale_items` and joins to `sales` for the org filter. Worst case scans large ranges of `sale_items` by id. Needs deeper EXPLAIN against the report's real shape before adding any index.

### Candidate C — `sale_orders` list (21 calls, mean 1,088 ms)

EXPLAIN of the bare list is sub-ms — the cost is from the LATERAL embed of `sale_order_items` per row. Each per-row probe uses `idx_sale_order_items_order` which exists. The 1s mean is suspicious — likely correlates with Candidate A (variant_id seq scans elsewhere on the same page). Re-measure after fix A.

### Candidate D (frequency only — NOT an index problem)

- #3 mass UPDATE of `purchase_items.mrp` — 1,000 calls × 148 ms = 148s. Looks like a one-row-at-a-time backfill loop in the app. Fix is in client code (batch or remove), not in the DB. Out of scope for this task; reporting only.
- #17 `sales WHERE id=$1` (10,496 calls) and #19 `customers WHERE id=$1` (10,343 calls) — already index scans on PK, ~0.5–1.2 ms each. They show up because they're called thousands of times. Client-side caching/dedupe would help; not an index problem.

### Candidate E — heavy report views (#12 `v_dashboard_stock_summary`, #23 `v_dashboard_purchase_summary`)

Mean 25–99 ms × 664/92 calls. Candidates for a materialized view + `pg_cron` refresh — propose only if numbers grow. Not urgent.

## Ranked fix list (awaiting approval)

1. **FIX A (only confirmed index)** — add `idx_sale_order_items_variant_id` on `public.sale_order_items(variant_id)` (partial `WHERE deleted_at IS NULL` is **not** applicable — table has no `deleted_at` referenced in this query). 40k rows, write impact negligible. Plain `CREATE INDEX` is fine (~40k rows, brief lock); we'll run it in low traffic. Re-run EXPLAIN to confirm Index Scan.
2. **REPORT B** — instrument/EXPLAIN the actual item-wise report query against a real org before proposing an index. Do NOT add anything yet.
3. **REPORT D** — flag the `purchase_items.mrp` update loop and the per-row `sales`/`customers` fetches to the app team as caching/batching work. No DB change.
4. **DEFER C, E** — re-measure after A lands.

## What this plan will NOT do

- Will not touch customer/billing math, RLS, soft-delete, print/PDF/WhatsApp.
- Will not add any speculative indexes for items 1, 2, 4–9, 11–16 — their plans already use existing indexes, or the cost is call-frequency, not query plan.
- Will not change search UI or list logic.

## On approval

Phase 2 will be a single `CREATE INDEX IF NOT EXISTS idx_sale_order_items_variant_id ON public.sale_order_items (variant_id);` migration, followed by re-EXPLAIN to confirm the seq-scan is gone. Phase 3 will compare `pg_stat_statements` totals for query #18 (and #10) after ~24 h.
