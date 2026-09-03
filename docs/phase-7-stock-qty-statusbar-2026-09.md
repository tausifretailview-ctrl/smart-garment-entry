# Phase 7 — StatusBar stock_qty

**Date:** 2026-09-03  
**Scope:** StatusBar stock tile and barcode stock lookup use authoritative `product_variants.stock_qty`. **No money formula change. Views left in place.**

Do **not** paste this Markdown into the SQL editor. Migration: `supabase/migrations/20261202120000_dashboard_stock_summary_stock_qty.sql`.

---

## Why

Phase 2 replaced the org-wide `v_dashboard_stock_summary` view with `get_dashboard_stock_summary`, but copied the live view body which still `SUM(pv.current_stock)`. `stock_qty` is the trigger-maintained on-hand column; `current_stock` is legacy/derived and can drift.

StatusBar already calls the RPC and displays `total_stock_qty`. After this migrate, that number is `SUM(stock_qty)` for active, non-deleted, non-service variants in the org.

If `current_stock` and `stock_qty` drifted on a shop, the tile **will change** — that is the correct figure, not a regression versus Phase 2’s “byte-identical to the view” rule (that rule was about swapping view → RPC with the same formula).

---

## Changes

1. **SQL** — `CREATE OR REPLACE FUNCTION get_dashboard_stock_summary` sums `pv.stock_qty`. Same filters, same output columns, same fail-closed `auth.role()` guard, `REVOKE`/`GRANT` as Phase 2.
2. **Scan lookup** — `lookupBarcodeStock` uses `canonicalOnHandQty` (`stock_qty` first; `0` does not fall through to `current_stock`).
3. **Not in this phase** — `v_dashboard_stock_summary` view body, Insights RPCs (already alias `stock_qty AS current_stock`), DailySaleAnalysis direct `current_stock` select, Recycle Bin hard-delete 21000 from Phase 1 Block 1.

---

## After Lovable applies

StatusBar stock on a shop with drift versus `current_stock` should match Stock Report / variant `stock_qty`, not the old tile. GitHub merge does not apply SQL.

**Catalog 2026-09-03 11:21** (`query-results-export-2026-09-03_11-21-32_6120.csv`): `phase2_stock_rpc=true`, `phase7_stock_qty_body=true`. Do **not** re-paste `20261129120000_get_dashboard_summary_rpcs.sql` (stock half would revert to `current_stock`). Purchase RPC is still missing — paste `scripts/phase-2-purchase-summary-only.sql`.

---

## Leftover (not this PR)

- `get_dashboard_purchase_summary` still absent (`phase2_purchase_rpc=false` on the same catalog row). Dashboard charts keep the view fallback until `scripts/phase-2-purchase-summary-only.sql` is applied.
- Phase 3 (`sale_items.organization_id` + `search_line_item_sale_ids`) and Phase 4 indexes still absent on that catalog row.
- Phase 1 Blocks 3–5 still uncaptured (Postgres ERROR histogram, pgss writes, cron).
- Recycle Bin `entity_hard_delete_purchase_bills` 21000 (DELETE without WHERE) — 34 rows in 30 days; client now uses `hard_delete_purchase_bill` RPC + `.eq(id, organization_id)` for other entities. Confirm live RPC if 21000 continues.
- `getNetSoldQtyByVariantIds is not defined` — helper exists in `src/utils/variantNetSoldQty.ts`; remaining reports may be stale bundles.
