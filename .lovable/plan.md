

## Fix: Cancel Purchase Bill — Invalid Stock Movement Type

### Root Cause
The `cancel_purchase_bill` RPC inserts `stock_movements` rows with `movement_type = 'cancel_purchase'`, but that value is **not** in the table's CHECK constraint. The constraint only allows: `purchase`, `sale`, `purchase_return`, `sale_return`, `purchase_delete`, `purchase_increase`, `purchase_decrease`, `sale_delete`, `soft_delete_purchase`, `restore_purchase`, … (full list above). Result: every cancel raises `stock_movements_movement_type_check` and rolls back the entire transaction → "0 bill(s) cancelled, 1 failed."

This affects ALL organizations, not just Velvet — the Velvet bill (PUR/26-27/26) just happened to be the one you tested. The barcode duplication you mentioned is unrelated; the cancel fails before reaching any unique-key issue.

### Fix (single migration, no frontend changes)

Replace the RPC's stock_movements insert to use `'purchase_delete'` — an already-allowed, semantically correct movement type used elsewhere in the codebase for purchase-driven stock reversal.

**Change in `cancel_purchase_bill` RPC (line ~103):**

```sql
INSERT INTO stock_movements
  (variant_id, movement_type, quantity, reference_id, organization_id,
   notes, bill_number, user_id)
VALUES
  (v_item.sku_id, 'purchase_delete', -v_item.qty, p_bill_id, v_org_id,
   'Stock reversed - purchase bill cancelled', v_item.bill_number, auth.uid());
```

(Only `'cancel_purchase'` → `'purchase_delete'` changes. All validation, batch_stock updates, voucher cleanup, and bill flagging stay identical.)

### Migration File

A new migration `supabase/migrations/<timestamp>_fix_cancel_purchase_bill_movement_type.sql` will be created containing the full updated `CREATE OR REPLACE FUNCTION cancel_purchase_bill(...)` definition with the corrected `movement_type` literal. This also fulfills the pending **Fix 7** from the earlier session — the RPC will finally live in the migrations folder.

### What Stays The Same
- Frontend code (`PurchaseBillDashboard.tsx`, `handleCancelBill`, `handleBulkCancel`) — untouched
- Stock validation logic (sold-items blocker) — untouched
- Voucher nullification logic — untouched
- `is_cancelled` / `cancelled_at` / `cancelled_reason` flagging — untouched

### Verification After Fix
1. Cancel PUR/26-27/26 → success toast, bill row shows gray "Cancelled" badge
2. Stock for variants `15007516` and `15007517` decreases by 5 and 2 respectively (reversal)
3. `stock_movements` table gets two rows with `movement_type = 'purchase_delete'`, negative qty, `reference_id = bill.id`
4. Bulk cancel of multiple bills works without the constraint error
5. Reports that already exclude `purchase_delete` movements (e.g., GST register) continue to behave correctly — no double-counting

### Why Not Add `'cancel_purchase'` To The Constraint?
- `purchase_delete` already represents "stock removed because a purchase was undone" everywhere else in the system (soft-delete flow uses `soft_delete_purchase`; hard-delete and cancel logically share the same reversal semantic as `purchase_delete`)
- Adding a new enum value would require auditing every report, dashboard query, and aggregation to decide whether to include or exclude it — high-risk
- Reusing the existing value is zero-risk and keeps movement-type taxonomy lean

