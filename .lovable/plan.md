## Goal

Keep the Lovable Cloud instance on the **small tier** with low monthly cloud usage, while making the app feel **faster** for the user. Focus only on the highest-impact hotspots surfaced by `pg_stat_statements` — no formula changes, no RLS changes, no behaviour changes.

## What the slow-query report actually shows

Top offenders by total DB time (last window):

| # | Pattern | Calls | Mean | Total time |
|---|---------|-------|------|------------|
| 1 | `products` + LATERAL `product_variants` list, no filter besides `org+status` | 12,467 | 2,262 ms | **7.8 hrs** |
| 2 | Same with `uom` column variant | 9,191 | 2,623 ms | 6.7 hrs |
| 3 | Same with nested `batch_stock` LATERAL | 45,001 | 446 ms | 5.6 hrs |
| 4 | `product_variants` by `barcode ilike` (search) | 19,422 | 671 ms | 3.6 hrs |
| 5 | `product_variants` barcode exact-OR-ilike, ordered by stock_qty | 10,008 | 1,150 ms | 3.2 hrs |
| 6 | `printer_presets` UPDATE | **1,684,678** | 6 ms | 2.9 hrs |
| 7 | `voucher_entries` description **ilike × 12** OR-chain | 91,006 | 67 ms | 1.7 hrs |
| 8 | `purchase_items` by sku_id ANY() | 75,771 | 95 ms | 2.0 hrs |

DB health: memory 63%, connections 23/90, DB 842 MB — **no instance pressure**. The cost is CPU burned on the queries above, not RAM/disk. Fix the queries, the small instance stays comfortable.

## Plan (8 focused fixes, no business-logic changes)

### 1. Index + trim the `products + product_variants` catalog reads (#1, #2, #3, #7 in table)

These are PostgREST `select=*,product_variants(...)` calls from product pickers / barcode pages. Each call scans the org's full product list and does a LATERAL join per row.

- Add composite indexes:
  - `products (organization_id, status) WHERE deleted_at IS NULL`
  - `product_variants (product_id) WHERE deleted_at IS NULL AND active = true`
  - `batch_stock (variant_id)` if not already present
- Audit callers that request `select=*` on products and switch to the **column list they actually use** (mirror the slim shape already used in POS search).
- Where the caller only needs the active set, add `.eq('status','active')` and `.is('deleted_at', null)` so indexes are usable.

### 2. Replace `barcode ilike '%x%'` scans with prefix / exact lookups (#4, #5, #8)

POS barcode scan currently uses `ilike` on `product_variants.barcode`, which cannot use the b-tree index.

- Use exact equality first; fall back to `ilike` **only** when the scanner input has no exact match.
- Add `product_variants_barcode_trgm` (`gin_trgm_ops`) index to make the rare ilike fallback also cheap.
- Same treatment for `purchase_items (sku_id, deleted_at)` composite index.

### 3. Stop the 1.68 M `printer_presets` UPDATE storm (#6)

A dedupe guard already exists in `BarcodePrinting.tsx`, but other call sites (`useBarcodeLabelSettings.tsx`, calibration auto-save in `BarcodePrinting.tsx` ~line 4098) still write on every render.

- Hoist the "did the payload actually change?" signature check into a shared helper and use it in every `printer_presets` write site (label settings hook, calibration auto-save, settings page).
- Debounce calibration auto-save to 1 s.
- Skip writes when `label_width` / `label_height` / `label_config` are identical to last saved values.

### 4. Replace the 12-pattern `voucher_entries.description ilike` OR-chain (#7)

This is the customer/supplier search in Accounts. Twelve `ilike` patterns × no usable index = full table scan per query.

- Add a generated `tsvector` column on `voucher_entries.description` with a GIN index, OR a simpler `description_lc` text column + GIN trigram index.
- Switch the query to a single `to_tsquery` / trigram match instead of 12 ORs.
- Keep the existing `organization_id` + `voucher_type` + `reference_type` filters first so the planner uses the composite path.

### 5. Cache the catalog picker reads on the client

These same `products+variants` calls run repeatedly because the product list / barcode page mounts often.

- Promote the existing product catalog query key to `STALE_REFERENCE` (2 min) where it isn't already.
- Reuse one shared query key across POS search, Sales Invoice search, and Barcode Print so they hit React Query cache instead of refetching.

### 6. Kill remaining "refetch on every mount" on read-mostly screens

Confirm `refetchOnMount: false` + `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` are applied to:
- Customer / Supplier ledger picker
- Accounts → Receipts list
- Settings sub-pages

(Phase 1/2 covered POS, Sales, Purchase, Products — these are the stragglers.)

### 7. Idle-time JS prefetch only, no Supabase prefetch

Confirm no `useQuery` is firing on idle prefetch effects — only chunk prefetch. Anything that polls every 30 s without a user request gets switched to manual / on-focus refetch.

### 8. Diagnostics doc

Update `docs/phase-2-cloud-savings.md` with a new "Phase 3 — small-instance hot queries" section and record before/after `pg_stat_statements` totals so we can prove the savings.

## Out of scope (explicitly)

- No change to `customerBalanceUtils`, no change to sale/payment formulas.
- No RLS rewrites; only index additions.
- No removal of any user-facing feature.
- No migration on `auth`, `storage`, or other reserved schemas.
- No instance resize.

## Files likely touched

- `supabase/migrations/<new>.sql` — indexes only (products, product_variants, batch_stock, purchase_items, voucher_entries trigram/tsvector).
- `src/pages/BarcodePrinting.tsx`, `src/hooks/useBarcodeLabelSettings.tsx` — dedupe + debounce.
- `src/hooks/useCustomerSearch.tsx` / accounts search hook — switch description ilike → trigram match.
- POS / Sales Invoice / BarcodePrint product fetchers — slim `select=` columns, shared query key.
- `docs/phase-2-cloud-savings.md` — Phase 3 notes.

## Expected outcome

- Top-10 `pg_stat_statements` total time roughly halved on the next sample.
- Product / barcode pages snappier on the small instance (mean falls from 2 s → < 300 ms for the catalog reads).
- Cloud usage budget continues to fit on the small tier.

Approve to start implementation, or tell me which of the 8 items to drop or reorder.
