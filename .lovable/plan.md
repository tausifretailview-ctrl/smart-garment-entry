## Problem

In Sales Invoice Dashboard, when a Credit Note is adjusted against an unpaid/part‑paid invoice (e.g. bill ₹6,800, CN adjust ₹5,300), the invoice flips to **Paid (Completed)** instead of staying **Partial** with ₹1,500 outstanding.

## Root cause

The dashboard CN‑adjust flow (`SalesInvoiceDashboard.tsx`, `handleRecordPayment`) does two things for the same CN amount:

1. Updates `sales.sale_return_adjust` += CN amount (line ~2067).
2. Writes a `voucher_entries` row with `payment_method = 'credit_note_adjustment'` (line ~2117).

After that, the reconciliation pass at lines 2237–2271 sums **all** receipt vouchers for the sale (including the CN voucher just inserted) into `receiptTotal`, then does:

```
reconciledPaid = min(net - sr, max(paid_amount, receiptTotal))
status = (reconciledPaid + sr >= net - 1) ? 'completed' : 'partial'
```

For the user's case: net=6800, sr=5300, paid=0, receiptTotal=5300 (CN voucher) → reconciledPaid=1500, then 1500 + 5300 = 6800 → **completed**, and `paid_amount` is written as 1500 even though no cash was received.

The list-render reconciler `reconcileSaleInvoiceDisplay` (in `src/utils/customerBalanceUtils.ts`) has the same double‑count: it adds the `cn` voucher bucket as extra settlement on top of `sale_return_adjust`, so even after a page refresh the status still shows Completed.

The `apply_credit_note_to_sale` RPC (POS flow) is unaffected because it bumps `paid_amount` instead of `sale_return_adjust`, so the existing `effectiveCash = max(salePaid - cn - adv, cash)` strip correctly cancels the double-count there. The bug only triggers for the dashboard CN-adjust path that touches `sale_return_adjust`.

## Fix

Stop counting the same CN twice when `sale_return_adjust` already represents it.

### 1. `src/pages/SalesInvoiceDashboard.tsx` — final sync in `handleRecordPayment`

- Change the `voucher_entries` query at line ~2237 to also select `payment_method`.
- Exclude rows where `payment_method IN ('credit_note_adjustment', 'advance_adjustment')` from `receiptTotal` so only true cash/card/upi receipts are compared against `paid_amount`.
- Status calc stays `reconciledPaid + sr >= net - 1 → completed`, which is correct because `sr` already encodes the CN/advance contribution.

Result for the user's case: receiptTotal=0, reconciledPaid=0, status = `0 + 5300 < 6799` → **partial**, balance ₹1,500.

### 2. `src/utils/customerBalanceUtils.ts` — `reconcileSaleInvoiceDisplay`

The `cn` voucher bucket must not be added on top of `sr` when both reflect the same applied CN. Adjust the helper so the non‑cash settlement bucket is reduced by `sr` already counted:

```
const cnNotInSr = Math.max(0, cn - Math.max(0, sr));
const cappedNonCash = Math.min(exposureAfterCashLike, adv + cnNotInSr);
```

Rationale:
- Dashboard flow: sr=5300, cn=5300 → cnNotInSr=0 → outstanding = net − sr − cash = 1500 ✔
- POS `apply_credit_note_to_sale` flow: sr=0, salePaid includes CN, cn voucher present → unchanged behaviour, still correctly partial ✔
- Pure sale‑return at billing time (sr>0, no cn voucher) → unchanged ✔
- Advance adjustments (`adv` bucket) → unchanged ✔

### 3. Optional one‑time data repair

Existing invoices already mis‑marked Completed by this bug will keep their wrong `paid_amount` / `payment_status` until touched. On next dashboard load the corrected `reconcileSaleInvoiceDisplay` will detect the drift (lines 642–668) and auto-sync them back to the correct partial status + correct `paid_amount`. No SQL migration required.

## Files to change

- `src/pages/SalesInvoiceDashboard.tsx` (final sync block ~lines 2237–2271)
- `src/utils/customerBalanceUtils.ts` (`reconcileSaleInvoiceDisplay`, ~lines 254–272)

## Out of scope (will not touch)

- POS `apply_credit_note_to_sale` RPC and `useCreditNotes` — already correct.
- Advance adjustment flow — already correct (only the receiptTotal filter is tightened, which is symmetric).
- Customer ledger and balance hooks — they use a separate ledger path that already excludes CN/advance vouchers from cash_pay.
