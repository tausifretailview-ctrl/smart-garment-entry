# Fix: CN Adjust Against Invoice — sales_payment_status_check violation

## Root cause

The database function `public.adjust_invoice_balance` (used by the "Adjust Credit Note against Invoice" dialog) writes the sale's `payment_status` as:

- `'Paid'` (capital P)
- `'Partial'` (capital P)

But the `sales_payment_status_check` CHECK constraint on the `sales` table only allows lowercase values:

```
payment_status IN ('pending', 'partial', 'completed', 'hold', 'cancelled')
```

So every adjustment fails with:
> Adjustment failed: new row for relation "sales" violates check constraint "sales_payment_status_check"

This is why Sharmin Mewara's credit-note adjustment in ELLA NOOR is failing — it's not data-specific, it would fail for every customer.

A second smaller issue: the same function also writes `credit_notes.status = 'Closed' | 'Partially Used'`, while the rest of the codebase uses `'active' | 'partially_used' | 'fully_used'` (see `useCreditNotes.tsx` and `apply_credit_note_to_sale`). This causes inconsistent CN statuses and breaks downstream logic that filters by `status = 'active'`.

## Plan

Create one migration that replaces `public.adjust_invoke_balance` with a corrected version:

1. **Fix payment_status casing** — compute it from the post-update balance and write one of:
   - `'completed'` when remaining balance ≤ 0
   - `'partial'` when partially paid
   - `'pending'` when nothing applied yet
   Skip overwriting if status is `'hold'` or `'cancelled'`.

2. **Fix credit_notes.status values** — use the project's canonical values:
   - `'fully_used'` when `used_amount >= credit_amount`
   - `'partially_used'` otherwise
   (Matches `useCreditNotes.tsx` logic.)

3. **Fix customer_advances.status values** similarly:
   - `'fully_used'` / `'partially_used'` (matches `reverseCustomerAdvanceFifo.ts`).

4. Keep all other behavior identical: row locking (`FOR UPDATE`), balance validation, `invoice_adjustments` history insert, exception wrapping.

## Verification

After the migration is applied, reproduce the Sharmin Mewara adjustment from `SaleReturnDashboard` → "Adjust against Pending Invoice" and confirm:
- No constraint error
- `sales.payment_status` becomes `'partial'` or `'completed'` (lowercase)
- `credit_notes.status` becomes `'partially_used'` or `'fully_used'`
- A row is written in `invoice_adjustments`

## Files / objects touched

- New migration replacing function `public.adjust_invoice_balance` (DB only — no frontend changes needed).
