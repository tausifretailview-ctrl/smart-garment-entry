# Repair Plan — 10 Legacy Balance Adjustment Mismatches

## Context

The gross-base bug in `CustomerBalanceAdjustmentDialog` is already patched (via Cursor). New adjustments now post the correct FIFO Dr-reduction. Ten pre-fix rows remain over-reduced — listed in the uploaded CSV, total excess **₹69,350** across 10 customers.

The Balance Adj. screen already exposes per-row **Delete (reverses effect)** and **Reverse (counter-entry)** actions wired to `reverseBalanceAdjustmentVouchers` in `src/utils/applyAdjustmentToInvoices.ts`. No new code needed — this is a data-repair procedure using the fixed UI.

## Procedure (repeat once per row in the CSV)

For each of the 10 adjustment IDs:

```text
Accounts → Balance Adj. tab
 ├─ Search customer (phone from CSV is fastest, e.g. 7521810294)
 ├─ Locate the flagged adjustment row (match adjustment_id / date)
 ├─ Click the ↩ Reverse icon  → confirms a counter-entry (audit-preserving)
 │      OR
 │  Click the 🗑 Delete icon  → reverses effect + removes row (cleanest)
 └─ Click + New Balance Adjustment
       ├─ Customer: same
       ├─ New Outstanding: value from `last_target_outstanding` (CSV col)
       ├─ Reason: original reason + " — reposted after FIFO fix"
       └─ Save   (now uses corrected logic → correct FIFO amount posts)
```

Recommended: **Delete → recreate**. Reverse leaves two rows in history; Delete keeps the customer ledger cleaner. Both call the same `reverseBalanceAdjustmentVouchers` helper that soft-deletes the linked `balance_adjustment` voucher entries.

## The 10 rows to repair (from `query-results-export-2026-07-16_14-40-21.csv`)

| Customer | Phone | Target Outstanding | Excess to recover |
|---|---|---:|---:|
| Tanvi Taufu | 9920527067 | 10,850 | 10,850 |
| KHADIJA SHEIKH | 8889466946 | 0 | 9,300 |
| Sana Chunawala | 9920614596 | 9,100 | 8,550 |
| APPROVAL | 7021241202 | 303,800 | 8,050 |
| Zainab Motiwala Jog | 9920243536 | 27,100 | 7,950 |
| Anees Bhai Office | 7521810294 | 5,700 | 7,700 |
| Syeda Fatima Sayed | 9160116600 | 11,700 | 6,350 |
| Anwari Khan | 9372421617 | 0 | 4,150 |
| Sana Rahil | 8408840858 | 21,700 | 3,500 |
| Aisha Moin Adhikari | 9029401233 | 28,700 | 3,000 |
| **Total** | | | **₹69,350** |

## Verification after each repair

1. Open **Customer Ledger** for that customer → confirm Outstanding equals the CSV `last_target_outstanding`.
2. Re-run `scripts/find-balance-adjustment-gross-base-mismatch-summary.sql` — the customer should drop out of the result set (or show `drift_from_target ≈ 0`).
3. Per-row deep check (optional): `scripts/verify-balance-adjustment-fifo.sql` with the new adjustment_id.

## Guardrails

- Run during low-traffic window; each repair is one customer only.
- Do NOT hand-edit `voucher_entries` or `customer_balance_adjustments` in SQL — the UI actions use tested reversal code that keeps ledger, advances, and CN links consistent.
- If a customer had further receipts/CNs applied *after* the bad adjustment, still Delete → Recreate; FIFO re-computes against the current invoice state.
- No app code changes in this plan (bug already fixed). Business logic untouched.

## Out of scope

- Bulk SQL repair script (possible but riskier; only 10 rows — manual UI path is safer and auditable).
- Changes to detection scripts or the fixed dialog code.
