# Phase 8 — Daily Sale Analysis stock_qty

**Date:** 2026-09-03  
**Scope:** The last dashboard table read of legacy `product_variants.current_stock`. No schema. No money formula.

Do **not** paste this Markdown into the SQL editor.

---

## Why

Phase 7 fixed StatusBar (`get_dashboard_stock_summary`) and barcode lookup. Daily Sale Analysis still selected `current_stock` only, and the variant fetch had **no `organization_id` filter** (RLS-only). Missing org filters on tenant tables have caused seq-scan blow-ups.

---

## Changes

`src/pages/DailySaleAnalysis.tsx`:

- Select `stock_qty, current_stock`
- `.eq("organization_id", orgId)` and `.is("deleted_at", null)`
- On-hand via `canonicalOnHandQty` (zero on `stock_qty` does not fall through)

Row field `currentStock` is unchanged (UI/export column). Insights RPCs still *alias* `stock_qty AS current_stock` — those are output names, not table reads.

---

## Not in this phase

- Recycle Bin 21000 (client already uses `hard_delete_purchase_bill` + `.eq(id, organization_id)` for other entities)
- Phase 1 Blocks 3–5 (Postgres ERROR histogram, pgss writes, cron)
- `v_dashboard_stock_summary` view body
