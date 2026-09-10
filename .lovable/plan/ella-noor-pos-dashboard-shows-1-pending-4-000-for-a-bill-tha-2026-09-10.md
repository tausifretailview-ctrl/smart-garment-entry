# ELLA NOOR — POS Dashboard shows 1 Pending (₹4,000) for a bill that was fully paid

## What the data shows (verified)

Bill POS/26-27/93, 09 Sep 2026, bill value ₹20,900.

- ₹4,000 was taken as cash at the counter — stored on the bill itself (cash column).
- ₹16,900 was collected later the same day by UPI and entered as a payment receipt (RCP/26-27/4643).
- Together that is ₹20,900 — the bill is fully collected.

But the saved "paid" figure on the bill is only ₹16,900 and its status is "partial", so the
Pending card counts 1 bill / ₹4,000. The bill row itself shows PAID because the list screen adds
counter cash and receipts together, while the summary cards use the saved figure. That is the
mismatch the user sees.

Cause: when a payment receipt is entered for a bill that already had counter cash, the system takes
the *larger* of the two (₹16,900) instead of counting both. The counter cash is silently dropped.

Checked the whole organisation from 01 Aug 2026: this is the only bill with both counter cash and a
later receipt, so the money impact today is limited to this one bill.

## Plan

1. Record the ₹4,000 counter cash of POS/26-27/93 as a proper cash receipt dated 09 Sep 2026, then
   recompute the bill. Result: paid ₹20,900, status Paid, Pending card drops to 0 bills / ₹0.
   No new money is invented — the ₹4,000 already sits on the bill; this only moves it into the
   receipt trail so both amounts are counted once each.
2. Scan the full history of ELLA NOOR (not just August onwards) for the same pattern — counter cash
   plus a later receipt where the two together cover the bill but the saved paid figure is lower.
   List them first; repair the same way only where counter cash and receipt clearly do not overlap.
3. Stop it happening again: when a payment is recorded against a bill that still carries untouched
   counter cash, first convert that counter cash into a receipt, so a later recalculation keeps
   both. This is done in the payment-recording path so the settlement rule itself is untouched and
   no bill can be double-counted.
4. Verify: reopen POS Dashboard for ELLA NOOR — Paid 103, Pending 0, Balance ₹0, and POS/26-27/93
   shows Paid with Cash ₹4,000 + UPI ₹16,900.

## Technical notes

- Sale `2c9c5adf-39ad-409f-b234-1dbdd58fe618`, org `3fdca631-1e0c-4417-9704-421f5129ff67`.
- `compute_sale_settlement` / `_v2` use `LEAST(cap, GREATEST(receipt_total, tender))` — the max, not
  the sum — so at-sale tender is discarded once any receipt exists. Formula left unchanged
  (changing it to a sum would double-count POS bills that dual-write tender and receipt).
- Repair = insert a `voucher_entries` receipt (`voucher_type='receipt'`, `reference_type='sale'`,
  `payment_method='cash'`, ₹4,000) via the existing numbering RPC, then run the recompute so
  `sales.paid_amount` / `payment_status` are rewritten by the canonical function.
- Guard goes in `src/utils/saleSettlement.ts` receipt-creation path (it already reads
  `cash_amount/card_amount/upi_amount` for cash-in reporting).
- Separate, not in scope here: several INV bills carry `paid_amount = 0` while receipts fully cover
  them; they already display as completed. Can be reconciled in a follow-up if wanted.
