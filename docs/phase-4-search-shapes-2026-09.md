# Phase 4 — Search shapes

**Date:** 2026-09-02  
**Scope:** Client query shapes that work **without** a new production RPC (Phase 3 `search_line_item_sale_ids` is still absent on Supabase). Indexes are additive.

Do **not** paste this Markdown into the SQL editor. Indexes: `scripts/phase-4-index-exists.sql`.

---

## What the live code actually was (not the old plan)

| Plan claim | Live |
|---|---|
| Two duplicate 28-OR product hooks | One util (`searchSaleOrderVariants`) fired **28-OR + a 4-field contains** query. Sales Invoice already used contains + client-side boundary. |
| `search_products` RPC | Does not exist. Product Master uses `get_product_catalog_page`. |
| ProductEditPanel last-purchase via `purchase_items` barcode ILIKE | Not a call site. |
| POS IMEI fallback is `%barcode%` | Already `.eq('barcode', …)` — left alone. |
| Purchase dashboard can go prefix-only | Placeholder is “supplier, bill no, barcode, product, brand” — **contains** for product text. Numeric 4+ digits already treated as barcode-like (date skip). |
| Sales “X results” can drop exact count | Invoice/POS show “Showing … of {totalCount}”. PostgREST `estimated` is exact on small sets, planner on large. |

POS scan-to-cart is **untouched**.

---

## Changes

1. **Products** — `searchSaleOrderVariants` no longer issues `buildProductTokenBoundaryOrFilter` (28 PostgREST ORs). One 4-field `%term%` query; token-boundary hits classified with `matchesProductTokenBoundary` (same as Sales Invoice).
2. **Purchase items barcode** — numeric 4+ digit terms: exact `.eq` then prefix `ilike term%`. Product text keeps 6-field contains.
3. **Sales dashboard count** — Invoice + POS `{ count: "estimated" }` instead of `"exact"` (the `pgrst_source_count` double-scan). Payments / Recycle Bin / admin counts unchanged.
4. **Indexes** (apply on live project): `idx_products_org_name_trgm`, `idx_purchase_items_barcode`, `idx_purchase_items_barcode_trgm`.

No new `SECURITY DEFINER` RPC in this phase.

---

## After migrate

Run `scripts/phase-4-index-exists.sql`. Expect three new names plus the existing org brand/style/category trigrams.
