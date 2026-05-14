## Root cause

Two independent bugs surface in the Customer Payment screen, both organisation-wide (not specific to TRIMBAK):

### 1. Cancelled invoices appear in the payment dropdown
`CustomerPaymentTab.tsx` (line 201) and `FloatingPayments.tsx` (line 201) filter only by `payment_status not in ('cancelled','hold')` and `deleted_at is null`. They do **not** check `sales.is_cancelled = false`. Cancelled invoices (which keep their old `payment_status` of `pending`/`partial`) therefore still show up as outstanding rows in the invoice picker and inflate the customer's outstanding balance.

### 2. Partial payment is mis-presented as a settlement discount
Today, when the user reduces the per-invoice allocation (e.g. `24,275 → 12,000`) or types a smaller `Amount`, the **Discount Settlement** panel pops up with a placeholder `Suggested: ₹12,275` and an `Apply ₹12,275 discount` button. Users read that as "discount already applied" and worry the remaining ₹12,275 has been written off, even though the underlying mutation correctly leaves it as outstanding when the discount field stays blank.

Per your decision: the gap should silently stay as outstanding; no discount should be suggested unless the user explicitly chooses to settle with a discount.

### 3. Confusion around `INV/26-27/331`
DB inspection (KS FOOTWEAR org) shows TRIMBAK's `INV/26-27/331` has `net=24,275`, `paid_amount=0`, no receipt voucher attached — i.e. the bill is intact and fully outstanding. The "₹275 badge" in your third screenshot is a different customer's invoice (likely Majida Darvesh `INV/26-27/331` in ELLA NOOR, `5,600 − 5,325 = 275`). No data healing is needed for TRIMBAK once the two code fixes above ship.

---

## Plan

### Fix A — Filter cancelled invoices (org-wide)

`src/components/accounts/CustomerPaymentTab.tsx` (the `customer-invoices` query, ~line 194):
- Add `.eq("is_cancelled", false)` to the `sales` select.
- Apply the same `is_cancelled = false` filter in the helper queries that read `sales` for this customer (voucher payments, opening-balance, totals).

`src/components/FloatingPayments.tsx` (the customer-invoices query, ~line 201 and the totals query at line 213):
- Add `.eq("is_cancelled", false)` to both selects.

### Fix B — Make the discount panel opt-in

`src/components/accounts/CustomerPaymentTab.tsx` discount section (~line 1524):
- Replace the automatic `showDiscountFields = paymentValue > 0 && paymentValue < selectedInvoiceTotal` with an explicit toggle:
  - Add state `const [enableDiscount, setEnableDiscount] = useState(false)`.
  - When `paymentValue > 0 && paymentValue < selectedInvoiceTotal`, render a single small **"Settle remaining ₹X as discount?"** link/button instead of the full panel.
  - Only when the user clicks that link (`enableDiscount = true`) do we render the full Discount Amount + Reason inputs.
  - Reset `enableDiscount`, `discountAmount`, `discountReason` whenever `referenceId`, `selectedInvoiceIds`, or `amount` changes back to a fully-paying value.
- Update the helper text near the per-invoice allocation row to say `"Reducing this amount keeps the balance outstanding."` so the intent is unambiguous.

The underlying mutation logic (lines 597–656) already treats an empty discount as "leave as outstanding", so no business-logic change is needed — only the UI presentation.

### Fix C — Verify (no DB writes needed)
- After deploying, re-open Customer Payment for TRIMBAK in KS FOOTWEAR: `INV/26-27/331` should show full ₹24,275 outstanding (already correct in DB).
- For any customer who has cancelled bills, confirm those rows no longer appear in the invoice picker and the "Outstanding Balance" header drops accordingly.

---

## Files touched
- `src/components/accounts/CustomerPaymentTab.tsx` — add cancelled filter + opt-in discount panel
- `src/components/FloatingPayments.tsx` — add cancelled filter to both `sales` queries

No migrations, no edge functions, no data writes.
