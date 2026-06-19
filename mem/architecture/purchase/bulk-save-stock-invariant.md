---
name: Purchase Bulk Save Stock Invariant
description: save_purchase_bill_with_items_atomic MUST call _apply_bulk_purchase_insert_effects whenever it sets app.bulk_purchase_insert. Post-save assertion compares stock_movements vs purchase_items qty and is non-removable.
type: constraint
---
# Purchase Bulk Save Stock Invariant

`save_purchase_bill_with_items_atomic` sets `app.bulk_purchase_insert = '1'` to skip the per-row `update_stock_on_purchase` trigger during the bulk INSERT into `purchase_items`. Because the trigger is bypassed, the function MUST then call `public._apply_bulk_purchase_insert_effects(v_bill_id)` before the GUC is reset, otherwise `stock_qty`, `batch_stock`, and `stock_movements` are never written and bills save with zero stock.

## Rules
- Any edit to `save_purchase_bill_with_items_atomic` (or any sibling RPC that sets `app.bulk_purchase_insert`) MUST keep the `_apply_bulk_purchase_insert_effects` call.
- The post-save guardrail block inside the RPC — SUM(stock_movements.quantity) for reference_id = v_bill_id must equal SUM(purchase_items.qty) for that bill — is **non-removable**. It exists to prevent the 2026-06-19 Ella Noor regression where 17 bills saved with stock_qty = 0.
- The same pattern applies to any future bulk insert helper: if you disable a stock trigger via a GUC, you must apply the effects explicitly and verify before commit.

## Why
On 2026-06-19 the atomic save RPC was deployed without the apply call. 17 production bills across multiple organizations had stock_qty = 0 until backfilled. The guardrail makes silent recurrence impossible — the transaction now raises and rolls back instead.
