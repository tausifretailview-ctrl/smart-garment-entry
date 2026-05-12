## Problem

Customer **Faiza Sheikh** (Ella Noor) had only ₹13,500 advance (ADV/25-26/0785), already fully used by INV/25-26/1372. On 12 May 2026 the system still allowed an "Advance Adjusted" entry of ₹4,600 (RCP/26-27/784) against INV/26-27/473, marking the invoice as Paid even though no advance balance existed.

## Root cause

The Sales Invoice Dashboard "Advance" payment mode computes `advanceBalance = bookingBalance + creditBalance`, where `creditBalance` is derived from a separately-computed customer outstanding. Due to a **mismatch between what is treated as a "payment" in the two formulas**, an already-applied advance can be double-counted as available credit:

- `getAvailableAdvanceBalance()` correctly returned **0** (advance fully used).
- `computeCustomerOutstanding()` counts the FIRST advance_adjustment voucher (RCP/25-26/1371) as a payment AND also subtracts the unused-advance pool (which is 0). Combined with `Math.max(salePaid, voucherAmt)` per sale, the calculation can produce a negative balance for customers whose advances were applied in full — making `creditBalance > 0` and re-offering the same advance as if it were still available.
- Result: dialog shows "Available Advance ₹X", Save button is enabled, voucher is written with `payment_method='advance_adjustment'`, but **no `customer_advances.used_amount` row is updated** (because `bookingDeduction = Math.min(amount, 0) = 0`).

The same defect exists in **`BulkAdvanceAdjustDialog`** and (separately) in **`CustomerPaymentTab`** where the user can pick `advance_adjustment` from the receipt-form payment-method dropdown with no balance check at all.

## Fix

### 1. Single source of truth for "Available Advance"

Use **only** `getAvailableAdvanceBalance(customerId)` (i.e. `customer_advances.amount - used_amount` for active/partially_used rows) as the cap. Remove the additive `creditBalance` fallback in:

- `src/pages/SalesInvoiceDashboard.tsx` → `handlePaymentModeChange` (advance mode) and the `bulkAdvanceBalance` effect.
- `src/components/BulkAdvanceAdjustDialog.tsx` → `loadData`.

Rationale: any "credit / overpayment" the customer holds that is NOT in `customer_advances` is a refund liability, not an advance — it should be returned via Refund or converted to an explicit Advance booking, not silently re-spent.

### 2. Hard guard at write time

In `SalesInvoiceDashboard.handleRecordPayment` (around line 2194) and `BulkAdvanceAdjustDialog.handleConfirm`:

- Re-fetch `getAvailableAdvanceBalance(customerId)` immediately before insert.
- If `amount > availableBalance + 0.01` → throw `"Insufficient advance balance"` and abort BEFORE creating the voucher / updating the sale.
- Always call `applyAdvance` (FIFO consumption) for the FULL `amount`, not `Math.min(amount, advanceFromBookings)`. With the guard above, the two are now equal.

### 3. CustomerPaymentTab receipt form

Currently the payment-method `<Select>` (around line 1436) accepts `advance_adjustment` as a free option that just writes a voucher with no FIFO consumption and no balance check.

- When `paymentMethod === "advance_adjustment"` is selected, gate the Save button on `paymentAmount <= advanceBalance` (already loaded via `useCustomerAdvanceBalance`).
- In the save flow, when paymentMethod is `advance_adjustment`, run the same FIFO consumption used by `applyAdvanceMutation` (lines 421-448) so `customer_advances.used_amount` actually moves.
- Show "Available Advance: ₹X" inline next to the amount field in this mode; disable the option entirely if `advanceBalance <= 0`.

### 4. Fix the existing bad data for Faiza Sheikh

One-time data correction (org `3fdca631-1e0c-4417-9704-421f5129ff67`, customer `225208d4-ea58-43ef-b605-6ff9d04f2f6c`, sale `4e5569a6` / INV/26-27/473):

- Soft-delete voucher RCP/26-27/784 (`voucher_entries.deleted_at = now()`).
- Reverse its accounting journal entry (`CustomerAdvanceApplication` ref).
- Reset INV/26-27/473: `paid_amount = 0`, `payment_status = 'pending'`, `payment_method = NULL`.
- Leave `customer_advances` row ADV/25-26/0785 untouched (it was already correctly fully-used by INV/25-26/1372).

After fix: ledger will show INV/26-27/473 as **Pending ₹4,600** and Outstanding (Dr) ₹4,600 — matching reality.

## Verification checklist

- [ ] Open Faiza Sheikh in Sales Dashboard → click ⓘ Pay on INV/26-27/473 → choose "Advance" → "Available Advance" shows **₹0** and Save button is **disabled**.
- [ ] Try the same on a different customer who DOES have an unused advance — flow still works, `customer_advances.used_amount` increments, voucher written.
- [ ] Bulk Adjust Advance dialog shows ₹0 for Faiza Sheikh and refuses to allocate anything.
- [ ] CustomerPaymentTab → pick payment method "Advance Adjustment" → entering more than available throws "Insufficient advance balance".
- [ ] Faiza Sheikh ledger: outstanding back to ₹4,600 Dr, RCP/26-27/784 no longer appears.

## Out of scope

- No changes to `useCustomerBalance` / `reconcile_customer_balances` formula — they already report correctly; only the "available to spend as advance" derivation was wrong.
- No DB-trigger guard on `voucher_entries` (would also block legitimate edits during reconciliation). Frontend guard + server-side balance check inside `apply_credit_note_to_sale`-style RPC can be added later if other entry points are discovered.