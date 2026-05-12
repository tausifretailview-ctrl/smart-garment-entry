## Problem

In the **KS Footwear** organisation, invoices show **"Invoice - pending"** in the Customer Ledger and on the Sales Dashboard even though receipts (RCP vouchers) have been recorded against them. The same data shows the invoice payment as a separate credit row, so the customer balance is correct, only the **status label** is wrong.

### Root cause (verified in DB)

Investigation of `voucher_entries` ↔ `sales` for KS Footwear shows:

- **686 invoices** are flagged `payment_status = 'pending'` and `paid_amount = 0`, but they have one or more receipt vouchers (`voucher_type = 'receipt'`, `reference_type = 'sale'`) pointing at them.
- **610 of those 686** have receipts ≥ invoice amount (should be `completed`).
- **76 of 686** have partial receipts (should be `partial`).

The current code in `CustomerPaymentTab.tsx` *does* update `sales.paid_amount` / `payment_status` after inserting the receipt voucher, but a large historical batch never got that follow-up update — most likely created before the update logic existed, via a bulk allocation, an import, or a partially-failed transaction. The ledger renders status straight from `sales.payment_status`, so it shows "pending".

This is a **data + safety-net fix** only. No UI logic changes.

---

## Fix Plan

### 1. One-time backfill migration (KS Footwear scope)

Create a SQL migration that, for the KS Footwear organization only, recomputes `paid_amount` and `payment_status` on every non-deleted, non-cancelled, non-hold sale based on the sum of its receipt vouchers + sale-return adjustments.

Logic per sale:

```text
receipt_total  = SUM(ve.total_amount + COALESCE(ve.discount_amount,0))
                 WHERE ve.reference_id = sale.id
                   AND ve.voucher_type = 'receipt'
payable_cap    = GREATEST(0, net_amount - sale_return_adjust)
new_paid       = LEAST(payable_cap, receipt_total)
new_status     = 'completed' if (new_paid + sale_return_adjust) >= net_amount - 1
                 else 'partial' if new_paid > 0
                 else 'pending'
```

Only writes a row when the recomputed values differ from current (≥ ₹1 tolerance), and skips `cancelled` / `hold` / soft-deleted sales. Scoped strictly by `organization_id = <KS Footwear org id>` per the project's "Scoped Mutations" rule.

### 2. Safety-net database trigger (all orgs)

Add an `AFTER INSERT / UPDATE / DELETE` trigger on `voucher_entries` for rows where `voucher_type = 'receipt'` AND `reference_type = 'sale'`. The trigger recomputes `sales.paid_amount` and `payment_status` for the affected `reference_id` using the same formula above.

This guarantees that any future flow (bulk allocation, import, manual SQL, future UI) keeps the sale's status in sync with its receipts — no more silent drift.

### 3. Verification

After the migration runs, re-query KS Footwear to confirm the count of `pending` sales with receipts drops to 0, and spot-check the Customer Ledger page to confirm the **"Invoice - completed / partial"** status now displays correctly.

---

## Technical details

**Files / artifacts**

- New migration: `supabase/migrations/<ts>_ks_footwear_payment_status_backfill_and_trigger.sql`
  - `UPDATE public.sales ... WHERE organization_id = '<KS Footwear id>' ...` (one statement, set-based, uses a CTE summing receipts).
  - `CREATE OR REPLACE FUNCTION public.sync_sale_payment_status_from_receipts()` returning trigger.
  - `CREATE TRIGGER trg_sync_sale_payment_status_from_receipts AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries`.

**No frontend code changes.** The Customer Ledger and Sales Dashboard already render whatever `sales.payment_status` says — once the column is correct, the UI will show "completed" / "partial" automatically.

**Out of scope**
- No change to balance math (already correct).
- No change to existing voucher rows.
- No data changes for any other organisation.
