# Supplier ledger: purchase return adjusted against a bill is counted twice

## What's happening

Confirmed on ELLA NOOR → FK PRODUCTION.

When a purchase return is adjusted against a bill, `AdjustCreditNoteDialog` adds the return amount to that bill's `paid_amount` (bill "1": net 2,29,100, `paid_amount` 55,000 — and there is **no** payment voucher for it, so the whole 55,000 is the return adjustment).

The supplier ledger then debits the same 55,000 in two places:

1. **"Payment at purchase" 55,000** — derived from `paid_amount` minus voucher payments. Since no voucher exists, the return adjustment is mistaken for cash paid at purchase.
2. **"Purchase Return PR/26-27/1 (Adj. Against Bill 1)" 55,000** — the return row itself.

Result: reconciliation subtracts `(-) Purchase Returns Adjusted 55,000` **and** `(-) Paid (Cash/Bank) 55,000`, so outstanding shows **5,03,100** when the true payable is **5,58,100** (6,13,100 − 55,000). Actual cash paid to this supplier is zero.

The same double subtraction exists in the database function behind Supplier Party Balances (`_get_supplier_party_balances_rows`): its `total_paid` uses `purchase_bills.paid_amount` while `unreflected_returns` separately subtracts the return's `net_amount`. The RPC returns 5,03,100 too, so the outstanding list, ledger and reconciliation are all off by the adjusted amount.

## Fix

**1. Exclude bill-linked return adjustments from "paid" (frontend)**
In `src/components/SupplierLedger.tsx` and `src/components/FloatingSupplierLedger.tsx`, build a per-bill map of return credit already applied to that bill (the existing `buildPurchaseReturnAdjustByBillId` helper in `src/utils/purchaseBillReturnAdjust.ts` does exactly this) and subtract it when computing `paidAtPurchase`:

```
paidAtPurchase = max(0, paid_amount − voucherPayments − legacyVoucherPayments − returnAdjustOnBill)
```

The purchase-return row stays as the single place the credit reduces the balance. For FK PRODUCTION the "Payment at purchase 55,000" row then disappears, Total Paid becomes ₹0, and the closing balance becomes 5,58,100.

**2. Same correction in the reconciliation block**
The "Paid (Cash / Bank)" line in the reconciliation panel must use the same adjusted figure, so `Net Purchases − Paid` reconciles with the running balance. "Purchase Returns Adjusted" keeps the 55,000.

**3. Same correction in the database function**
New migration replacing `_get_supplier_party_balances_rows` so `bill_paid_by_supplier` subtracts return credit already booked into `paid_amount` for bills that have an `adjusted` return linked to them and no matching payment voucher. Keeps `unreflected_returns` as the only subtraction of that amount. This keeps Supplier Party Balances, the Outstanding tab and the ledger reading the same number.

**4. Verify**
- FK PRODUCTION: ledger closing, reconciliation and party balance all read ₹5,58,100 with Total Paid ₹0.
- Re-run `scripts/verify-supplier-party-balances-parity.sql` for the org and confirm no supplier drifts, including suppliers with real cash payments plus a return (the common case must not regress).
- Spot-check a supplier whose return is `adjusted_outstanding` or `refunded` (no bill link) — those must be unchanged.

## Technical notes
- No data is rewritten. `paid_amount` keeps including the adjustment (the purchase-bill dashboard depends on it for status and already annotates "incl. P/R adj."); only the ledger and balance readers stop counting it a second time.
- Only affects returns with `credit_status = 'adjusted'` and a `linked_bill_id`.
- Scope is org-scoped read paths; no change to purchase return creation or stock.
