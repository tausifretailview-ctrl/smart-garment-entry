## Verification result: repairs NOT yet applied

The freshly uploaded Query B export (`query-results-export-2026-07-16_14-53-21.csv`) still lists all 10 original customers with the same `total_excess_over_correction` values (₹69,350 total). If any row had been repaired via Delete → Recreate, it would have dropped out of the query result set (that query only returns rows where `issue_class <> 'OK_OR_MINOR'` and excess > ₹1).

### Row-by-row status (target vs current outstanding)

| Customer | Phone | current_outstanding | last_target_outstanding | drift_from_target | Status |
|---|---|---:|---:|---:|---|
| Tanvi Taufu | 9920527067 | 4,700 | 10,850 | −6,150 | Not repaired |
| KHADIJA SHEIKH | 8889466946 | −9,550 | 0 | −9,550 | Not repaired |
| Sana Chunawala | 9920614596 | 5,300 | 9,100 | −3,800 | Not repaired |
| APPROVAL | 7021241202 | 293,200 | 303,800 | −10,600 | Not repaired |
| Zainab Motiwala Jog | 9920243536 | 19,700 | 27,100 | −7,400 | Not repaired |
| Anees Bhai Office | 7521810294 | −3,900 | 5,700 | −9,600 | Not repaired |
| Syeda Fatima Sayed | 9160116600 | 0 | 11,700 | −11,700 | Not repaired |
| Anwari Khan | 9372421617 | −4,150 | 0 | −4,150 | Not repaired |
| Sana Rahil | 8408840858 | 5,700 | 21,700 | −16,000 | Not repaired |
| Aisha Moin Adhikari | 9029401233 | 10,500 | 28,700 | −18,200 | Not repaired |

All ten still show negative drift (current outstanding is BELOW target) — confirming the earlier over-reduction is still in the ledger and no Delete/Recreate has been performed yet through the UI.

### Interpretation of `drift_from_target`

Note that `drift_from_target` in this run (e.g. Tanvi −6,150, Sana Rahil −16,000) is often larger than `total_excess_over_correction` (Tanvi 10,850, Sana Rahil 3,500). That's because current outstanding also reflects any new sales/receipts posted AFTER the bad adjustment. The authoritative number to restore is `last_target_outstanding` — that is what the operator originally intended.

### Action required (unchanged from the approved plan)

For each of the 10 rows, in the app:

```text
Accounts → Balance Adj. tab
 ├─ Search by phone (fastest)
 ├─ Locate the flagged adjustment (adjustment_id in CSV)
 ├─ 🗑 Delete   (reverses FIFO effect via reverseBalanceAdjustmentVouchers)
 └─ + New Balance Adjustment
       ├─ Customer: same
       ├─ New Outstanding: last_target_outstanding from CSV
       ├─ Reason: original reason + " — reposted after FIFO fix"
       └─ Save   (fixed dialog now posts correct FIFO amount)
```

### After each repair — verify

1. Open the customer's Ledger → Outstanding should equal `last_target_outstanding`.
2. Re-export Query B (`scripts/find-balance-adjustment-gross-base-mismatch-summary.sql`) — the repaired customer must disappear from the results (or show `total_excess_over_correction ≈ 0`).

### Completion criterion

Repairs are complete when Query B returns **zero rows** for this organization. Current run returns 10 rows → 0 of 10 done.

### Out of scope

- No code changes (the underlying bug in `CustomerBalanceAdjustmentDialog` is already fixed via Cursor).
- No bulk SQL repair — manual UI Delete→Recreate is safer and auditable for 10 rows.
