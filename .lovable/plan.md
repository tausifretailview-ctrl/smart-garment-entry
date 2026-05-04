## Problem

When a fee receipt is edited from ₹5,000 down to ₹3,000 in **Fees Collection → Edit**, the balance shrinks by ₹5,000 instead of by ₹3,000 (off by the reduction amount). The Student Ledger and Year-wise totals also drift.

## Root Cause

`ModifyFeeReceiptDialog` does two things on save:

1. **Updates the existing `student_fees` row** — sets `paid_amount` to the new (reduced) value. This alone correctly changes the balance.
2. **Inserts a `student_balance_audit` row** with `reason_code = 'receipt_modified'`, `adjustment_type = 'debit'` (when amount is reduced), and `change_amount = old - new`.

But every balance calculator (FeeCollection grid, Student Ledger, year-wise PDF balances) treats every `student_balance_audit` row as a **real financial adjustment** and adds it to the displayed due:

```
Total Due = Liability + adjustmentsNet − paymentsTotal
```

So for a ₹5,000 → ₹3,000 edit on a ₹34,800 liability:
- `paymentsTotal` correctly drops from 5,000 to 3,000 (✓)
- `adjustmentsNet` extra debit of −2,000 is applied (✗ — phantom)
- Result: 34,800 − 2,000 − 3,000 = **29,800** instead of the correct **31,800**

This is the exact same class of bug that was already fixed for `receipt_deleted` — the audit row is **trace-only** and must not affect balances. The current filters only exclude `receipt_deleted`, not `receipt_modified`.

The voucher row is updated (`voucher_entries.total_amount`), but the underlying double-entry `account_ledgers` lines posted by `postSchoolFeeReceiptAccounting` are **not** rewritten. That causes the Student Ledger/journal totals to drift by the same delta.

## Fix

Code-only changes. No data cleanup, no DB writes outside what already happens.

### 1. Exclude `receipt_modified` from balance math (mirror the `receipt_deleted` fix)

In every place that already does `.neq("reason_code", "receipt_deleted")`, also exclude `receipt_modified`. Switch to `.not("reason_code", "in", "(receipt_deleted,receipt_modified)")`.

Files:
- `src/pages/school/FeeCollection.tsx` — both query sites (~line 280 and ~line 416)
- `src/components/CustomerLedger.tsx` — both query sites (~line 747 and ~line 973)
- `src/lib/schoolFeeYearBalances.ts` — both query sites (~line 71 and ~line 207)

### 2. Keep modify-receipt journal in sync

In `src/components/school/ModifyFeeReceiptDialog.tsx`, after updating `student_fees` and `voucher_entries`, also rewrite the linked `account_ledgers` rows (and student sub-ledger credit) so the journal total matches the new `paid_amount`. Approach: look up rows by the matching `voucher_number = fee.payment_receipt_id`, scoped by `organization_id`, and update each line's `debit`/`credit` to the new amount (single-line cash receipt, so a straight overwrite is safe). If no journal lines are found for legacy receipts, skip silently.

### 3. Stop double-purposing the audit row (optional defense-in-depth)

Keep inserting the `receipt_modified` audit row as a trace (it shows up in History dialogs already), but set `academic_year_id` to the same value the receipt belongs to. The exclusion in step 1 makes this safe regardless. No schema or migration changes needed.

## Verification (manual after fix)

For the test student with the ₹34,800 liability:
1. Collect ₹5,000 → balance should read **₹29,800** in Fees Collection grid and Student Ledger.
2. Edit that receipt to ₹3,000 → balance should read **₹31,800** (not 29,800).
3. Print receipt shows ₹3,000 with correct remaining ₹31,800.
4. Delete the modified receipt → balance returns to **₹34,800**.
5. Student Ledger running balance matches Fees Collection total at every step.

## Out of scope

- No migrations, no historical data backfill.
- No UI redesign of the modify/collect dialogs.
- No change to receipt numbering or audit-row schema.
