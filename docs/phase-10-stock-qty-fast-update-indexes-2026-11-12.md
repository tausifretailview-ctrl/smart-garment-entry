# Phase 10 — Let stock changes take the fast (HOT) update path (2026-11-12)

**Status:** proposed; run on the live database by the owner, outside shop hours.
**Repo change:** this record only. No migration, same as
[phase-9-write-path-index-drop-2026-09-29.md](./phase-9-write-path-index-drop-2026-09-29.md).

Plan Phase 3, finding D2: every sale, purchase and return changes `product_variants.stock_qty`.
While `stock_qty` is in **any** index (key, `INCLUDE` or `WHERE`), Postgres cannot do a HOT
(cheap) update: it writes a new entry into **every** index of the table, inside the save,
while the row is locked. Phase 9 noted the three indexes and left them.

---

## Evidence (live, 2026-11-12, owner ran a read-only `pg_stat_*` query)

`product_variants`: 208,743 rows, 219 MB with indexes, 18 indexes.
Updates 339,289, HOT 129,499 = **38.2 %** (18.7 % on 2026-09-29). So about 6 in 10 stock
changes still rewrite all 18 indexes (≈ 210 MB of index).

Indexes that contain `stock_qty` (all three must go before any stock change can be HOT):

| Index | Definition | Scans | Size | What covers it instead |
|---|---|---:|---:|---|
| `idx_product_variants_stock_qty` | `(stock_qty) WHERE stock_qty <= 10` | 523 | 11 MB | not org-scoped; every app query filters by `organization_id` → `idx_product_variants_org` |
| `idx_variants_pos_active` | `(organization_id, stock_qty) WHERE deleted_at IS NULL AND active` | 184,967 | 23 MB | `idx_product_variants_org` `(organization_id) WHERE deleted_at IS NULL` (85,018 scans); `active` / stock filtered on the rows |
| `idx_product_variants_product_org_active` | `(product_id, organization_id) INCLUDE (stock_qty) WHERE deleted_at IS NULL` | 41,310,205 | 26 MB | `idx_product_variants_product` `(product_id) WHERE deleted_at IS NULL` (341,220) and `idx_product_variants_org_product_active` `(organization_id, product_id) WHERE deleted_at IS NULL` (28,338,685) |

The third one is heavily used, but only because it is the narrowest product lookup; its
`INCLUDE (stock_qty)` only helps index-only scans, and on a table updated this often few
pages are all-visible, so the row is read anyway. The two twins answer the same lookups.

App queries on stock (repo search): all are scoped by `organization_id` and most first
narrow by name / barcode text, then `order("stock_qty")` or `gt/lt("stock_qty")`:
`StockReport` (low stock, sorted ascending), `dashboard/StatsChartsSection` (top 5),
`mobile/OwnerDashboard` (low stock `< 5`), `ProductSearchDropdown`, `posQuickPriceCode`,
`saleOrderProductSearch`, `mobileVariantNameSearch`, `stockTransferSearch` (`> 0`),
`BarcodePrinting` (`> 0`). The biggest shop has a few tens of thousands of sizes, so
sorting them after the org index is milliseconds.

Kept: everything else, including `idx_product_variants_org_barcode_trgm` (1 scan, but
added on purpose on 2026-10-15 for Quick Stock / POS search) and the tiny
`idx_product_variants_deleted_at` (0 scans, 120 kB).

---

## What to run (Cloud SQL editor, one statement per run, outside shop hours)

The editor wraps each run in a transaction, so `CONCURRENTLY` fails (`25001`). A plain
`DROP INDEX` takes a short exclusive lock; each is instant.

```sql
DROP INDEX IF EXISTS public.idx_product_variants_stock_qty;
```
```sql
DROP INDEX IF EXISTS public.idx_variants_pos_active;
```
```sql
DROP INDEX IF EXISTS public.idx_product_variants_product_org_active;
```

Leave room on each page for HOT updates (applies to pages written from now on; no rewrite):

```sql
ALTER TABLE public.product_variants SET (fillfactor = 90);
```

Check (expect no rows, then `{fillfactor=90,autovacuum_vacuum_scale_factor=0.05}` in some order):

```sql
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
  'idx_product_variants_stock_qty','idx_variants_pos_active','idx_product_variants_product_org_active');
SELECT reloptions FROM pg_class WHERE oid = 'public.product_variants'::regclass;
```

---

## What to watch

Baseline 2026-11-12: updates 339,289, HOT 129,499 (38.2 %). After a week, re-run the
Phase 10 read-only query; the HOT share of the **new** updates
(`(hot_now − 129,499) / (upd_now − 339,289)`) should be well above 38 %, and bill-save
times in Platform Admin → Speed should not get worse.

| Screen | If clearly slower, recreate |
|---|---|
| Stock Report low-stock list, owner low-stock card, dashboard top items | `idx_variants_pos_active` |
| POS / Sale Bill product search, stock per product | `idx_product_variants_product_org_active` |

## Undo (after shop hours, one statement per run)

Each build blocks writes to `product_variants` while it runs (seconds to about a minute).

```sql
CREATE INDEX idx_variants_pos_active ON public.product_variants USING btree (organization_id, stock_qty) WHERE ((deleted_at IS NULL) AND (active = true));
CREATE INDEX idx_product_variants_product_org_active ON public.product_variants USING btree (product_id, organization_id) INCLUDE (stock_qty) WHERE (deleted_at IS NULL);
CREATE INDEX idx_product_variants_stock_qty ON public.product_variants USING btree (stock_qty) WHERE (stock_qty <= (10)::numeric);
ALTER TABLE public.product_variants RESET (fillfactor);
```

## Do not recreate by accident

These repo migrations still contain `CREATE INDEX IF NOT EXISTS` for them; they are history.
Re-pasting a whole file brings the index back:

- `supabase/migrations/20251108193626_*.sql` — `idx_product_variants_stock_qty`
- `supabase/migrations/20260217182449_*.sql` — `idx_variants_pos_active`
- `supabase/migrations/20260425202145_*.sql` — `idx_product_variants_product_org_active`
