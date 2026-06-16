# Performance Report — Small Instance Slowness

## What we measured

Pulled the database's slowest queries (ranked by total CPU time since the last reset). Three patterns are eating almost all of the small instance's headroom. Cloud backend itself is healthy — this is workload, not infrastructure.

### Top offenders

| # | Pattern | Calls | Avg time | Total CPU |
|---|---------|-------|----------|-----------|
| 1 | Products list with embedded variants (POS / Inventory / Search) — `products?select=*,product_variants(*)` filtered by `organization_id + status + deleted_at` | 12,467 | **2,262 ms** | **7.8 hrs** |
| 2 | Same query variant (different column set) | 9,191 | 2,623 ms | 6.7 hrs |
| 3 | Products + variants + **batch_stock** nested embed | 45,001 | 446 ms | 5.6 hrs |
| 4 | Barcode `ilike` lookup on `product_variants` (no `organization_id` filter) | 19,422 | 671 ms | 3.6 hrs |
| 5 | Products + variants + batch_stock (Item‑wise stock) | 17,413 | 703 ms | 3.4 hrs |
| 6 | Variant by exact barcode w/ product join, ORDER BY stock_qty | 9,998 | 1,146 ms | 3.2 hrs |
| 7 | **`printer_presets` UPDATE** | **1,681,886** | 6 ms | **2.9 hrs** |
| 8 | Products list with size_groups + variants (Product Master) | 2,269 | 3,542 ms | 2.2 hrs |
| 9 | Purchase items by `sku_id = ANY(...)` (Item‑wise stock supplier join) | 75,692 | 94 ms | 2.0 hrs |

### Root causes

1. **Products + variants list is too heavy.** Many screens (POS dropdown, Inventory dashboard, Item‑wise Stock, Product Master) fetch *all* products of the org with full variant arrays — and a few also nest `batch_stock`. On a small instance this becomes a 2–3 second query under load.
2. **Barcode `ilike` searches** run without an `organization_id` predicate, so the trigram index scans variants from *every* tenant.
3. **`printer_presets` is being written 1.68 million times** — every label render or barcode print is persisting `label_config / label_height / label_width` instead of saving only when the user actually changes settings. This alone consumes ~10 ms × millions of writes worth of WAL / I/O on a small instance.

## Fix plan (no UI changes)

### A. Frontend — stop the write storm and slim the reads

1. **`printer_presets` save throttle** — only `UPDATE` when the user opens settings and clicks Save (or when label dimensions actually differ from the last persisted value). Today the BarcodePrinting / label flows are saving on every render/print.
2. **Drop `batch_stock` from list queries** — keep it only on the History dialog / Item‑wise Stock detail row expand. List screens (Inventory dashboard, Products page) do not display batch info.
3. **Lift React Query `staleTime` for product reference lists** to `STALE_REFERENCE` (120 s) on Inventory dashboard and POS catalog — they currently refetch too often after navigation.
4. **Barcode lookup hook** — always pass `organization_id` in the `product_variants` filter for both the exact match and the `ilike` fallback. Hook lives in `useOrgQuery.ts` / barcode scan paths.
5. **Item‑wise Stock supplier join** — replace per‑row `purchase_items` lookup with the existing `batch_stock` join (single fetch) so we don't make 75 k extra requests per session.

### B. Database — one composite index

Add a single covering index to support the sorted Product Master query (offender #8) and the org+status filter on offenders #1/#2:

```sql
CREATE INDEX IF NOT EXISTS idx_products_org_status_name
  ON public.products (organization_id, status, product_name)
  WHERE deleted_at IS NULL;
```

No CONCURRENTLY (cannot run inside a migration). Trade‑off: slightly slower product INSERTs/UPDATEs (negligible at our volume), faster reads.

### C. Validation

After deploy, with diagnostics on:
```
localStorage.setItem('ezzy_cloud_usage','1'); location.reload();
```
Run the baseline journey (POS → Sales Dashboard → Accounts → Inventory → POS) and compare `window.__ezzyCloudUsage.printReport()` numbers. Expected effect on small instance:
- Product list queries: **2,200 ms → ~300 ms**
- `printer_presets` writes: **1.6 M → < 1 K / day**
- Barcode lookup: **670 ms → < 100 ms**

## Technical notes

- Files to touch (frontend): `src/hooks/useBarcodeScanner.tsx`, `src/hooks/useOrgQuery.ts`, `src/pages/ItemWiseStockReport.tsx`, the Inventory/Products list hooks, and the BarcodePrinting screen that persists `printer_presets`.
- Files to touch (DB): one new migration with the composite index above.
- No schema/data changes, no UI rework, no behavior change for end users — only fewer round‑trips and lighter queries.

## Out of scope

- Upgrading the instance back to medium (only if savings above aren't enough).
- Edge‑function level changes.
- Any feature/UI redesign.
