# Fix: Missing Advance Bookings (ELLA NOOR)

## What I confirmed in the DB

- ELLA NOOR has **only 1 advance booking saved today** (ADV/26-27/166, ₹1,000, 1:50 PM IST, UPI). Its journal entry is posted correctly.
- Advance number sequence is **continuous** (no gaps) → no rolled-back rows hiding.
- No Postgres errors for advances in the morning window.
- Accounting engine is **enabled** for this org.

The "morning multiple advances" the user reported are **not in the database at all** and were never persisted. The save UI either errored silently from the user's perspective, or the user saved on a different org / used the adjust-from-advance flow (which doesn't create advance rows).

## Plan

### 1. Add a forensic audit log table (one-time)
Create `advance_booking_attempts` (org-scoped, RLS) capturing every Save click — user_id, customer_id, amount, payment_method, status (`attempted`/`succeeded`/`failed`), error_message, timestamp. Keeps a record even when the mutation fails, so we can prove what happened next time.

### 2. Fix the silent-failure UX in `AddAdvanceBookingDialog.tsx`
- The current `handleSubmit` catches errors with an empty block. Toast does fire from the hook, but it can be dismissed quickly. Replace the empty catch with a **loud, non-dismissible error dialog** showing: "Advance NOT saved — {reason}". User must click OK.
- Disable the dialog close button while `createAdvance.isPending` to avoid losing context.

### 3. Add post-save verification
After `mutateAsync` resolves, immediately re-`SELECT` the advance by `id` from DB. If not found (e.g., interceptor rolled it back due to GL failure), show the same loud error and DO NOT show the print prompt.

### 4. Verify chart-of-accounts for ELLA NOOR
Run `seedDefaultAccounts` check against ELLA NOOR org to confirm code `2150` (Customer Advances) and cash/bank/UPI ledger accounts exist. If missing, the GL post throws → advance is deleted server-side. Seed any missing system accounts.

### 5. Reconciliation report
Add a small admin tool: `Advance Save Failures (last 7 days)` reading from the new `advance_booking_attempts` table where `status = 'failed'`, scoped to current org. Owner can review what was attempted but not saved.

### 6. Educate the user / UI clarification
Rename **"Adjust from Advance"** button on the customer ledger to **"Apply Existing Advance Balance"** so users don't confuse it with creating a new advance booking. Add a tooltip: *"This applies an already-received advance to invoices. To record a NEW advance, use 'Add Advance Booking'."*

## Out of scope (per memory: do not modify without explicit ask)
- Will NOT touch `useCustomerAdvances.tsx` core mutation, `journalService.ts`, `customerBalanceUtils.ts`, or the auto-rollback `delete()` behavior. Only wrap the UI side and add the audit table.

## Files to change
- **NEW** migration: `advance_booking_attempts` table + RLS + index `(organization_id, created_at)`
- `src/components/AddAdvanceBookingDialog.tsx` — verification + loud error dialog + audit insert
- `src/components/CustomerLedger.tsx` — relabel adjust-advance button + tooltip
- **NEW** `src/pages/AdvanceSaveFailures.tsx` — read-only admin report
- Route entry in `src/App.tsx` for the new report

## Acceptance
- Saving an advance with intentionally broken chart-of-accounts shows a blocking error dialog (no print prompt, no false "saved").
- An entry appears in `advance_booking_attempts` with `status='failed'` and the SQL error message.
- Successful saves continue to behave exactly as today and also log `status='succeeded'`.
