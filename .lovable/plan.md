

## Permanent Fix: Customer Balance Calculation (Nazbin Choudhury & all similar cases)

### Ground truth (verified)
- Nazbin's true balance = **₹0** (Σ sales 27,700 = Σ vouchers 27,700; advances ₹15,900 fully used).
- `useCustomerBalance` hook math: returns balance=0 ✓ (works correctly here).
- `reconcile_customer_balances` RPC math: returns **11,800 Dr** ✗ (severely wrong).
- The "₹700 Dr" the user sees is a related symptom — it appears wherever the system reads from the broken RPC or from hooks that share the same bug class.

### Two real bugs in the RPC

**Bug A — `cash_pay` CTE (line 18-31 of RPC)** filters on `reference_type = 'sale'`. But this org's older receipts use `reference_type = 'customer'` with `reference_id = sale_id` (legacy data pattern). Result: 4 of Nazbin's 5 invoice receipts are skipped.

**Bug B — `open_pay` CTE (line 32-42)** assumes `reference_type='customer'` rows have `reference_id = customer_id`. For this org, those rows have `reference_id = sale_id`. So it joins to nothing and silently drops ₹15,650 of legitimate receipts.

**Bug C — Double subtraction** for advance-funded receipts. Receipts with `payment_method='advance_adjustment'` are excluded from `cash_pay` AND the same money is subtracted again as `total_advances`. For Nazbin: ₹3,350 + ₹450 + ₹4,600 = ₹8,400 of advance-funded receipts → not counted as payment, then ₹15,900 of advances subtracted (which already covers them).

### The fix (one migration, RPC rewrite)

Rewrite `reconcile_customer_balances` so the cash_pay CTE classifies receipts by **what `reference_id` actually points to**, not by `reference_type`:

```sql
cash_pay AS (
  SELECT s.customer_id, SUM(ve.total_amount) AS total
  FROM voucher_entries ve
  JOIN sales s ON s.id = ve.reference_id   -- join purely by id match
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND s.deleted_at IS NULL
    AND s.payment_status NOT IN ('cancelled','hold')
  GROUP BY s.customer_id
),
open_pay AS (
  SELECT ve.reference_id AS cust_id, SUM(ve.total_amount) AS total
  FROM voucher_entries ve
  JOIN customers c ON c.id = ve.reference_id  -- only match real customer rows
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type = 'customer'
    AND NOT EXISTS (SELECT 1 FROM sales s2 WHERE s2.id = ve.reference_id)
  GROUP BY ve.reference_id
),
```

Then change the balance formula to **stop double-subtracting advances**. Two equivalent approaches:

**Option 1 (cleaner)**: subtract `total_advance_used` instead of `total_advances`, and don't re-subtract advance-funded vouchers (since they ARE the advance application):
```
balance = opening
        + total_invoices
        - total_cash_payments_excluding_advance_method
        - total_advance_used
        - total_sale_returns
        + total_refunds_paid
        + adjustments
```

For Nazbin: 0 + 31,300 − 11,800 − 15,900 − 3,600 + 0 = **0** ✓

### Also fix the duplicate `useCustomerBalance` hook

Apply the same correction so the History Dialog stays consistent with the RPC:
- Sum invoice voucher payments by **id-match** (already does this).
- Subtract `unusedAdvanceTotal` (already does).
- Cap `totalSales` at gross only when `saleReturnTotal` is also subtracted — current formula `net+sale_return_adjust − saleReturnTotal` is correct.
- Verify Nazbin returns 0 (already does, per trace).

### Verification step (post-fix)

After migration:
```sql
SELECT customer_id, calculated_balance, total_invoices, total_cash_payments,
       total_advances, total_advance_used, total_sale_returns
FROM reconcile_customer_balances('3fdca631-1e0c-4417-9704-421f5129ff67')
WHERE customer_id = '836c93d6-18c4-4858-ae10-9659329f87a2';
-- expect calculated_balance = 0
```

Also spot-check 5 other customers in ELLA NOOR to confirm no regressions.

### Files / changes

1. **New migration** — `CREATE OR REPLACE FUNCTION reconcile_customer_balances(...)` with the corrected CTEs and formula above.
2. **`src/hooks/useCustomerBalance.tsx`** — small audit pass; align comments and ensure the `Math.max(salePaidAmount, voucherAmount)` vs current `voucherAmount > 0 ? voucherAmount : salePaidAmount` is consistent (both work for Nazbin; the first is safer when paid_amount drifts from voucher sum).
3. **`src/hooks/useCustomerSearch.tsx::useCustomerBalances`** — same id-match-based classification so the customer dropdown chip matches the dialog.

### Out of scope

- No data backfill — receipts with `reference_type='customer'` but `reference_id=sale_id` are LEFT AS-IS (the new logic handles them correctly without rewriting history).
- No UI text changes.

### Risk

Low — changes are server-side aggregation only. Hook math for Nazbin already returns 0, so the dialog "₹700" must originate from a path consuming the RPC's wrong figure (CustomerReconciliation page or any list using it). Fixing the RPC + the two hooks closes all paths.

