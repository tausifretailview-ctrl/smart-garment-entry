# School fees: liability and due (internal)

This document describes how **expected fees**, **opening / carried balance**, **adjustments**, and **receipts** combine in the School ERP fee module. The implementation lives mainly in:

- `src/lib/schoolFeeOpening.ts` — effective opening after prior-year receipts
- `src/lib/schoolFeeLiability.ts` — **gross liability** (structure + opening rules)
- `src/pages/school/FeeCollection.tsx` — **canonical** active-session grid (`totalDue`)
- `src/components/school/FeeCollectionDialog.tsx` — collection UI (must match grid for current session)
- `src/lib/schoolFeeYearBalances.ts` — per-academic-year pending (receipts, WhatsApp, “all years”)

## Data model (short)

| Source | Role |
|--------|------|
| `students.closing_fees_balance` | Stored opening / carry-forward (may be gross or net — see `fees_opening_is_net`) |
| `students.is_new_admission` | Admission path uses opening only, not “structure + opening” |
| `students.fees_opening_is_net` | When true, opening is already net of prior-session receipts (do not subtract again) |
| `fee_structures` | Class + academic year expected totals (amount × frequency) |
| `student_fees` | Payments / receipt lines (`paid_amount`, `academic_year_id`, optional `fee_head_id`) |
| `student_balance_audit` | Credits/debits that change due without a fee head |

## Step 1 — Effective opening (`resolveImportedOpeningBalance`)

Inputs: gross `closing_fees_balance`, sum of **prior academic year** receipts (`latePrevPaid`), and `openingIsNet`.

| `openingIsNet` | Result |
|----------------|--------|
| `true` | `max(0, grossClosing)` — do not subtract `latePrevPaid` |
| `false` | `max(0, grossClosing - latePrevPaid)` |

**Where `openingIsNet` is set**

- **Fee Collection grid** (`FeeCollection.tsx`): `student.fees_opening_is_net === true` (same for all students in that query; not scoped to a loop year).
- **Year-wise helper** (`computeYearWiseFeeBalances`): `openingIsNet` is true only when the loop year `Y` equals `student.academic_year_id` (student’s enrolled session). Other years in the loop use gross-style subtraction against that year’s “previous year” payments.

So the **grid** and **year-wise breakdown** can differ in edge cases around `fees_opening_is_net`; if numbers disagree, compare these two call sites first.

## Step 2 — Gross liability (`resolveLiability`)

Inputs: student (with **effective** `closing_fees_balance` after step 1), **structure total** for that session/class, and `year_name` (for one legacy rule).

| Condition | Liability |
|-----------|-----------|
| `is_new_admission === true` | `closing_fees_balance` only |
| Structure total `> 0` | structure total **+** `closing_fees_balance` |
| Else, `year_name === "2025-26"` and opening `> 0` and structure `<= 0` | `closing_fees_balance` only (legacy safeguard) |
| Else | `closing_fees_balance` only |

Single implementation: `src/lib/schoolFeeLiability.ts`.

## Step 3 — Due for one academic session (grid)

For the **active** session row in `FeeCollection.tsx`:

1. `importedBalance = resolveImportedOpeningBalance(grossClosing, latePrevPaidFromPrevYear, fees_opening_is_net === true)`  
2. `liability = resolveLiability({ ...student, closing_fees_balance: importedBalance }, structureTotal, year_name)`  
3. `adjustmentNet` = sum of audit credits minus debits for that year  
4. `paidTotal` = sum of `student_fees` for that year with `status` in paid/partial and `paid_amount > 0`  
5. **`totalDue = max(0, liability + adjustmentNet - paidTotal)`**

Pending summary aggregation uses the same components per student.

## Collect dialog vs grid

The dialog builds **line items** from `fee_structures` and allocates **remaining due** to an **“Opening balance (carried forward)”** row when `totalDue` exceeds the sum of structure line balances, so the **collect total** matches **`totalDue`** on the grid for the current session. Opening/import lines post to `student_fees` with `fee_head_id` / `fee_structure_id` null where applicable.

## Accounting (vouchers, chart, student sub-ledger)

On successful fee collection, `postSchoolFeeReceiptAccounting` in `src/lib/schoolFeeAccounting.ts`:

1. Inserts **`voucher_entries`** (`reference_type = student_fee`, `voucher_number` = fee receipt no.).
2. Inserts **`voucher_items`**: **Dr** cash/bank asset (`account_ledgers`), **Cr** income — per fee head if `fee_heads.income_account_id` is set, otherwise **School Fee Income** (created under `account_ledgers` if missing).
3. Inserts **`student_ledger_entries`** credits (`voucher_type = FEE_RECEIPT`) — one line per collected component, analogous to customer receipt credits.

`public.delete_fee_receipt` removes **`student_ledger_entries`** and **`voucher_items`** for that receipt, then soft-deletes the **`voucher_entries`** row (existing `student_fees` soft-delete unchanged).

## Maintenance after external merges (e.g. Lovable)

When fee logic changes, diff together:

- `FeeCollection.tsx`
- `FeeCollectionDialog.tsx`
- `schoolFeeYearBalances.ts`
- `schoolFeeLiability.ts` / `schoolFeeOpening.ts`
- `schoolFeeAccounting.ts` / `studentLedger.ts` / `delete_fee_receipt` migration

Avoid reintroducing duplicate `resolveLiability` bodies; extend the shared module and this doc if rules change.
