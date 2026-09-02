# Phase 5 — Index hygiene (keep all eight)

**Date:** 2026-09-02  
**Scope:** Decision record. **No DROP. No migration.** Appendix B already measured live `idx_scan`.

Do **not** paste this Markdown into the SQL editor. To re-sample scans, paste `scripts/phase-5-keep-indexes.sql` (one SELECT).

---

## Appendix B (captured 2026-09-02)

Source: `query-results-export-2026-09-02_23-31-26_11ef.csv` — `pg_stat_user_indexes` for the eight names in Phase 1 Appendix B.

The pairs are **not duplicates**. Partial = `WHERE deleted_at IS NULL` (live lists). Unfiltered = Recycle Bin / include-deleted / joins that omit the partial predicate.

| Index | Kind | `idx_scan` | Size |
|---|---|---:|---|
| `idx_sale_items_sale` | partial | **216,117,673** | 3440 kB |
| `idx_sale_items_saleid` | unfiltered | **166,486,927** | 3448 kB |
| `idx_purchase_items_bill` | partial | 25,061,606 | 2000 kB |
| `idx_purchase_items_billid` | unfiltered | 2,758,113 | 2448 kB |
| `idx_purchase_items_sku` | partial | 10,369,802 | 4680 kB |
| `idx_purchase_items_sku_id` | unfiltered | 282,007 | 6496 kB |
| `idx_product_variants_org` | partial | 772,764 | 2504 kB |
| `idx_product_variants_organization_id` | unfiltered | 106,141 | 2592 kB |

Definitions (in-repo):

- Partial: `supabase/migrations/20260122044354_*.sql` — `idx_sale_items_sale`, `idx_purchase_items_bill`, `idx_purchase_items_sku`, `idx_product_variants_org` (`WHERE deleted_at IS NULL`).
- Unfiltered: `idx_sale_items_saleid` / `idx_purchase_items_billid` (`20260216023413`), `idx_purchase_items_sku_id` (`20251106212937`), `idx_product_variants_organization_id` (`20251201184151`).

---

## Verdict

**Keep all eight. Do not DROP.** The original plan item “drop the four duplicate pairs” is closed as **incorrect on production evidence**.

- Hottest pair is `sale_items` (216 M vs **166 M**). Phase 3 EXPLAIN used `idx_sale_items_saleid` for invoice JOIN (ILIKE residual). Dropping it would hit the live search path.
- Unfiltered copies are not idle: 166 M / 2.8 M / 282 k / 106 k scans. Recycle Bin reads `deleted_at.not.is.null` (`src/pages/RecycleBin.tsx`) — the partial index cannot serve those rows.
- Combined extra disk is ~11 MB. Write cost of the unfiltered btree is real but ** dwarfed by breaking Recycle Bin / sale-id nested loops**.

Phase 4 added *new* indexes (`idx_products_org_name_trgm`, `idx_purchase_items_barcode*`). Those are additive and out of this pair list.

---

## What this phase does not do

- No `DROP INDEX`
- No rewrite of Recycle Bin
- No wait for another month of `idx_scan` — both sides are already hot by orders of magnitude past “maybe unused”

Re-sample later with the same SELECT if `idx_scan` is reset after a major upgrade. Do not treat a post-reset zero as permission to drop.
