# Phase 9 — Drop five near-unused indexes on the bill-save path (2026-09-29)

**Status:** Done on the live database, 2026-09-29, by the owner in the Cloud SQL editor.
Verified afterwards: `pg_indexes` returns none of the five names.
**Repo change:** this record only. No migration (see "Do not recreate by accident").

Context: POS / Sale Bill saves are "sometimes slow". See
[pos-purchase-slowness-2026-09-28.md](./pos-purchase-slowness-2026-09-28.md).

---

## Evidence (live, 2026-09-29)

**Role limits** (`pg_roles.rolconfig`): `authenticated` `statement_timeout=8s`;
`authenticator` `statement_timeout=8s`, `lock_timeout=8s`; `anon` 3s.
So an app request that waits on a row lock for 8 s fails.

**Update cost** (`pg_stat_user_tables`):

| Table | Updates | HOT (cheap) | HOT % |
|---|---:|---:|---:|
| `product_variants` | 1,850,623 | 346,714 | **18.7** |
| `sales` | 481,491 | 275,979 | 57.3 |
| `sale_items` | 354,754 | 34,568 | **9.7** |

`stock_qty` is in three heavily used indexes (`idx_product_variants_product_org_active`
INCLUDE, `idx_variants_pos_active`, `idx_product_variants_stock_qty`), so a stock change
cannot be HOT and writes every `product_variants` index (21 before this change). Fewer
indexes = less work inside the save while the row is locked. GIN (trigram) indexes also
flush their pending list inside a random insert, which fits "one save is suddenly slow".

**Usage** (`pg_stat_user_indexes`, `stats_reset` = 2025-11-04 02:17 UTC):

| Dropped index | Scans | Size | Kept twin (scans) |
|---|---:|---:|---|
| `idx_variants_color_trgm` | 1 | 5.3 MB | `idx_product_variants_org_color_trgm` (7,883) |
| `idx_product_variants_org_barcode_trgm` | 2 | 12 MB | `idx_product_variants_barcode_trgm` (12), `idx_product_variants_barcode` (8,223,345), `idx_product_variants_org_barcode` (653,735) |
| `idx_sale_items_org_size_trgm` | 28 | 7.2 MB | `idx_sale_items_trgm_size` (31,319) |
| `idx_sale_items_org_color_trgm` | 99 | 6.6 MB | `idx_sale_items_trgm_color` (33,113) |
| `idx_sales_customer_name` | 99 | 1.4 MB | `idx_sales_trgm_customer_name` (20,583) |

Caveat: the two `sale_items` org indexes were created by
`20261130120000_sale_items_org_search_rpc.sql` (Phase 3, deployed after 2026-09-03), so
their counts cover weeks, not the full window since `stats_reset`. They back the size /
colour branches of `search_line_item_sale_ids` (`src/utils/lineItemSaleSearch.ts`, POS and
Invoice dashboard line-item search). Those branches still have the non-org trigram twins
(same `deleted_at IS NULL` predicate) plus the `organization_id` filter.

Considered and **kept**: `idx_variants_low_stock` (24 MB, 8 scans — likely a low-stock
report; check first), `idx_sales_trgm_salesman` (23), `idx_sales_credit_note` (possible FK
lookup), and tiny partial indexes (`is_dc`, `irn`, `einvoice_status`, `deleted_at`).
The Phase 5 "keep all eight" pairs are untouched.

---

## What was run

The Cloud SQL editor wraps every run in a transaction, so `CONCURRENTLY` fails there
(`25001`). Plain `DROP INDEX`, one statement per run, outside shop hours:

```sql
DROP INDEX IF EXISTS public.idx_variants_color_trgm;
DROP INDEX IF EXISTS public.idx_product_variants_org_barcode_trgm;
DROP INDEX IF EXISTS public.idx_sale_items_org_size_trgm;
DROP INDEX IF EXISTS public.idx_sale_items_org_color_trgm;
DROP INDEX IF EXISTS public.idx_sales_customer_name;
```

Check:

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND indexname IN (
  'idx_variants_color_trgm','idx_product_variants_org_barcode_trgm',
  'idx_sale_items_org_size_trgm','idx_sale_items_org_color_trgm','idx_sales_customer_name');
-- expect: no rows
```

---

## What to watch

| Screen | Uses | If clearly slower, recreate |
|---|---|---|
| POS / Invoice dashboard search by **size** or **colour** (line items) | `search_line_item_sale_ids` | `idx_sale_items_org_size_trgm` / `idx_sale_items_org_color_trgm` |
| Product search by **colour** / **barcode** (POS, Sale Bill, Sale Order) | `product_variants` ILIKE | `idx_variants_color_trgm` / `idx_product_variants_org_barcode_trgm` |
| Lists sorted or filtered by exact **customer name** | `sales.customer_name` | `idx_sales_customer_name` |

Re-sample in a few days: the kept twins' `idx_scan` should keep rising.

## Undo (after shop hours, one statement per run)

Without `CONCURRENTLY` (editor limitation) each build blocks writes to that table while
it runs — seconds to about a minute.

```sql
CREATE INDEX idx_variants_color_trgm ON public.product_variants USING gin (color gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_product_variants_org_barcode_trgm ON public.product_variants USING gin (organization_id, barcode gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_sale_items_org_size_trgm ON public.sale_items USING gin (organization_id, size gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_sale_items_org_color_trgm ON public.sale_items USING gin (organization_id, color gin_trgm_ops) WHERE (deleted_at IS NULL);
CREATE INDEX idx_sales_customer_name ON public.sales USING btree (customer_name);
```

## Do not recreate by accident

These repo migrations still contain `CREATE INDEX IF NOT EXISTS` for some of them. They
are history and were left unchanged (guard tests read the Phase 3 file). Re-pasting a
whole migration brings the index back:

- `supabase/migrations/20261130120000_sale_items_org_search_rpc.sql` — `idx_sale_items_org_size_trgm`, `idx_sale_items_org_color_trgm`
  (the Phase 3 checklist says "paste the whole file" — it is already applied; do not re-paste)
- `supabase/migrations/20260308164557_*.sql` — `idx_variants_color_trgm`
- `supabase/migrations/20251114051724_*.sql` — `idx_sales_customer_name`

`idx_product_variants_org_barcode_trgm` has no migration in the repo (created directly on live).
