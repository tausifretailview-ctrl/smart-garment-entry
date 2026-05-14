## Investigation findings

### Issue 1 — INV/25-26/523 "auto paid" + Sales Dashboard / Audit / Ledger mismatch

DB state for INV/25-26/523 (NEW LAXMI FOOTWEAR):
- `sales.net_amount = 19,118`, `sales.paid_amount = 19,118`, `payment_status = completed`
- Only one receipt exists in `voucher_entries`: RCP/26-27/162 = ₹10,000 (UPI, 14-May-2026)
- No CN, no advance applied → ₹9,118 of `paid_amount` has **no backing voucher** (data drift from an earlier code path)

Why each report disagrees:
- **Sales Dashboard** reads `sales.paid_amount` directly → shows Paid (wrong, should be Partial / 9,118 pending)
- **Customer Account Statement (Audit)** sums `voucher_entries` only → outstanding **35,074 Dr** (correct picture of money actually received)
- **Customer Ledger** (`CustomerLedger.tsx` line 1755-1783) creates a **synthetic "Payment at sale" credit row** = `sale.paid_amount − voucherPayments` = `19,118 − 10,000 = 9,118`. This phantom 9,118 is added on top of the real 10,000 receipt → ledger over-credits → outstanding 25,956 (wrong)

So the audit register is correct (₹35,074 Dr); both Sales Dashboard and Customer Ledger are wrong because they trust the inflated `sales.paid_amount`.

### Issue 2 — Settlement discount missing from Customer Ledger

Receipts taken with a discount (e.g. RCP/26-27/163-2: cash ₹7,474 + discount ₹543 against INV/26-27/34) store the discount in `voucher_entries.discount_amount`. The Customer Audit bundle already adds it to the credit (`voucherCreditAmount = total_amount + discount_amount`).

But `CustomerLedger.tsx` line 533 selects only `total_amount`, so the ledger renders the receipt as ₹7,474 Cr and the ₹543 discount is never credited — the bill stays ₹543 short of settling.

## Fix plan

### A. Customer Ledger — stop trusting drifted `paid_amount`
File: `src/components/CustomerLedger.tsx` (~ line 1755)

Replace
```ts
const totalPaidOnSale = isExchangeCoveredByReturn ? 0 : (sale.paid_amount || 0);
const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
```
with the actual at-sale tender (cash + card + upi only, never a derived figure):
```ts
const paidAtSale = isExchangeCoveredByReturn
  ? 0
  : Math.max(0,
      Number(sale.cash_amount || 0) +
      Number(sale.card_amount || 0) +
      Number(sale.upi_amount  || 0));
```
Result: synthetic phantom credits disappear, ledger closing matches the Audit Register (₹35,074 Dr in this case).

### B. Customer Ledger — credit settlement discount
File: `src/components/CustomerLedger.tsx`

1. Line 533 — extend select: `'..., total_amount, discount_amount, ...'`
2. Wherever a voucher row is pushed as `type: 'payment'` (around lines 1607 / 2055), set:
   `credit: Number(v.total_amount || 0) + Number(v.discount_amount || 0)`
   and append `Discount: ₹543` to the description when `discount_amount > 0` (already present in the voucher's own description, but ensure it renders).
3. Same widening for `voucherPaymentsBySaleId` aggregation: add `discount_amount` to the per-sale total.

This brings the Customer Ledger row in line with the Audit Register and Customer Payment Tab, both of which already include `discount_amount` in the credit.

### C. Sales Dashboard — payment status from receipts
File: `src/pages/SalesInvoiceDashboard.tsx`

Use the existing `reconcileSaleInvoiceDisplay()` helper from `src/utils/customerBalanceUtils.ts` (already in the codebase) when computing the row's displayed paid / outstanding / status. It clamps `effectivePaid` against the actual non-advance voucher sum and the payable cap, so a drifted `paid_amount` of 19,118 against a 10,000 voucher is shown as Partial with 9,118 pending.

### D. One-time data heal (optional but recommended)
SQL migration to bring `sales.paid_amount` back in line with reality for legacy drift, scoped per organization:
```sql
UPDATE public.sales s SET
  paid_amount = LEAST(
    GREATEST(0, s.net_amount - COALESCE(s.sale_return_adjust, 0)),
    COALESCE((SELECT SUM(ve.total_amount + COALESCE(ve.discount_amount,0))
              FROM voucher_entries ve
              WHERE ve.reference_id = s.id
                AND ve.voucher_type = 'receipt'
                AND ve.deleted_at IS NULL), 0)
  ),
  payment_status = CASE
    WHEN ... >= net_amount - 1 THEN 'completed'
    WHEN ... > 0 THEN 'partial'
    ELSE 'pending' END
WHERE s.organization_id = '<org>'
  AND s.deleted_at IS NULL
  AND s.payment_status NOT IN ('cancelled','hold')
  AND s.payment_method <> 'pay_later';  -- pay_later guarded by trigger
```
Run only after A/B/C are merged. This will, e.g., reset INV/25-26/523 to `paid_amount=10,000`, `payment_status='partial'` so the Sales Dashboard shows ₹9,118 pending naturally — and prevents the same drift from recurring on other customers.

## Out of scope
- Hunting the original code path that wrote 19,118 into `paid_amount` — audit logs only capture status changes, not paid_amount values; with A+C+D in place the symptom cannot recur regardless of source.
- Any changes to advance / CN application logic.

Approve to implement A, B, C and prepare D as a reviewable migration.