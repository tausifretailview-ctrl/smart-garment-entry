## What I found

I queried KS Footwear's sales and matched the bills from your note (HINA FOOTWEAR-KURAR MALAD: 682, 560, 463, 337, 293) and the screenshot (SHOE POINT-MIRAROAD E: 724, 533, 299, 150).

Every one of these "partial" invoices shows the same fingerprint — the cash you actually received plus the settlement discount you entered equals **the bill amount minus its GST portion** (~9% or ~18%). Example:

```
INV/25-26/724  Net 17,727   Cash 15,599  Discount 532   Recorded paid 16,131   Residual 1,596 (= 9% of 17,727)
INV/25-26/682  Net  2,945   Cash  2,237  Discount 177   Recorded paid  2,414   Residual   531 (= 18%)
INV/25-26/299  Net 15,933   Cash 14,021  Discount 478   Recorded paid 14,499   Residual 1,434 (= 9%)
```

Org-wide scan in KS Footwear:
- 81 partial bills with residual, totalling ₹2,35,911 across 59 customers.
- Of those, 27 bills match the GST-percentage fingerprint — these are the ones caused by the settlement-discount regression.
- The remaining ~54 bills are genuine partial payments (residuals do not match a GST %).

## Root cause (suspected)

When recording a payment with Settlement Discount, the discount amount entered by the user was treated as **pre-tax**, so only `cash + discount` was credited to AR while the GST portion of that discount stayed open on the invoice. We patched a related path earlier (paid_amount / payment_status sync); the discount→AR side is still under-crediting.

## Plan

### Step 1 — Confirm the cleanup scope with you
Two distinct buckets:
1. **GST-fingerprint residuals (27 bills, KS Footwear)** — these are the bug you're describing. Safe to write off as additional settlement discount so the bills close to ₹0 and customer balance drops accordingly.
2. **Other partial bills (~54)** — leave untouched (real outstanding).

I'll share the full list of 27 bills (customer, invoice, residual) before any change. Same scan will be run on Ella Noor and Velvet so we catch the same pattern there.

### Step 2 — Backfill cleanup (data-only, via insert)
For each confirmed bill:
- Mark the residual as a settlement discount by updating `sales.paid_amount = net_amount - sale_return_adjust` and `payment_status='completed'`.
- Write a `voucher_entries` row of type `receipt`, `payment_method='settlement_discount'`, `total_amount=0`, `discount_amount=<residual>`, description "Settlement discount — auto-cleanup of GST-residual from discount feature bug", linked to the sale.
- No new cash is created; this only reclassifies the unpaid portion as discount, exactly as if the original receipt had carried the full discount.

This matches the existing customer-balance formula (settlement discount counted in `voucherCreditAmount` as `total_amount + discount_amount`) so the customer's outstanding drops by the residual amount immediately, with audit trail.

### Step 3 — Fix the discount feature so it stops happening
Locate the payment-receipt save path (FloatingPayments + CustomerPaymentTab) and verify how `paid_amount` and the voucher row are computed when Settlement Discount is used. Ensure `sales.paid_amount` is incremented by `cash + discount` (full settlement) so no residual remains, and confirm the same on edit. Add a small guard: if user marks a bill as fully settled via discount, force `paid_amount = net_amount - sale_return_adjust`.

### Step 4 — Verification
- Re-run the scan: 27 GST-fingerprint bills should be zero.
- Spot-check HINA FOOTWEAR and SHOE POINT-MIRAROAD E outstanding on Customer Ledger and Outstanding report — should drop by the cleared residuals.
- Make one test receipt with settlement discount on a sandbox bill to confirm the fix prevents new residuals.

## Out of scope
- No change to the genuine partial bills.
- No change to reports, UI, or other organisations' historical data unless they show the same fingerprint.

## Question before I implement
Do you want me to:
(a) Auto-clear all 27 GST-fingerprint bills in KS Footwear (plus equivalents in Ella Noor / Velvet) as settlement discount, **or**
(b) Send you the list first so you can confirm bill-by-bill, **or**
(c) Only fix the code going forward and leave history as-is?
