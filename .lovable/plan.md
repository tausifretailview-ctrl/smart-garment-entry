# ELLA NOOR — the 70 deleted vouchers in Recycle Bin: what they actually are

Read-only investigation done. Nothing was written. Of the 70, **64 were deleted by automated repair scripts** (agent/SQL batches, no `deleted_by` user) and **6 were deleted by one signed-in user**.

## Breakdown by deletion event

| When (UTC) | Rows | Amount | What it was | Actor |
|---|---|---|---|---|
| 09-May 11:17 | 1 | 11,300 | credit note CN-00004 (from SR/26-27/24) | script |
| 12-May 15:17 + 15:32 | 4 | 17,650 | "Adjusted from advance balance" receipts | script |
| 01-Jun 18:00 | 17 | 93,750 | credit_note_adjustment batch — **verified justified** (each linked sale carries a matching `sale_return_adjust`) | script |
| 06-Jun 19:25 | 28 | 143,600 | tagged `[cn_over_apply_repair_20260606] phantom credit_note_adjustment receipt removed` — **the false-positive batch** (Hanif bhai case came from here) | script |
| 07-Jun 14:17 | 1 | 4,500 | RCP/26-27/1488 payment on INV/26-27/1312 | user 49d3…5e40d |
| 25-Jun 16:14 | 1 | 7,500 | RCP/26-27/2100 advance application | user 49d3…5e40d |
| 01-Jul 10:01 / 10:04 | 4 | 8,900 | tagged `phantom_cn_repair_2026 | Cr balance applied…` — created then deleted by the July repair itself | script |
| 13-Jul 10:59 | 3 | 11,050 | FIFO reallocation of legacy balance-adjustment credit | user 49d3…5e40d |
| 16-Jul 10:38 | 1 | 2,600 | ARF/26-27/30 advance refund, Zoya Ali | script |
| 17-Jul 09:40 | 1 | 1,600 | balance adjustment on INV/26-27/1498 | user 49d3…5e40d |
| 28-Jul 11:42 | 1 | 100 | EXP/26-27/252 FREIGHT — ordinary expense delete | script/UI |
| 29-Jul 12:17–12:29 | 6 | 47,300 | tagged `[reversed 29-07-2026: duplicate advance application …]` | script |
| 08-Aug 18:32 | 2 | 5,120 | RCP/1917 + RCP/1918, identical ₹2,560 twice on INV/26-27/1653 — duplicate payment cleanup | script |

Only the EXP/26-27/252 freight row looks like a normal day-to-day shop deletion. Everything else is repair-batch activity from the credit-note / advance-balance clean-ups, plus 6 deliberate deletions by one user.

## What is safe and what is not

- The 01-Jun 17 and the 29-Jul 6 removed **genuine double counts**. Restoring them would credit money twice. Leave them.
- The 06-Jun 28 is the batch already under review; 11 of those are the wrongly-deleted set, of which 7 are still clean candidates (₹42,350) pending the shop's answers on the Hanif ₹3,050 / Arezah ₹3,150 / GULNAZ ₹750 / FIZA ₹200 remainders.
- The 01-Jul 4 rows are the July repair's own receipts, deleted the same minute they were made — noise, not lost money.
- The 6 user deletions and the 08-Aug duplicate pair should be confirmed with the shop but each has a clear reason recorded.

## Proposed next steps

1. Ask the shop to confirm the 6 user-made deletions (07-Jun, 25-Jun, 13-Jul ×3, 17-Jul) were intentional. If any was a mistake it is restorable individually — those are not part of the June batch.
2. Do not use the Recycle Bin "Restore" button on any script-tagged row. Restoring a repair-batch receipt re-introduces the double count the repair removed; the correct restores go through the audited Phase C in the earlier plan, tagged and logged.
3. Optional hygiene so this reads clearly next time: surface `notes` (the repair tag) as a "Deleted by" / "Reason" column in the Vouchers tab of Recycle Bin, and label rows with no `deleted_by` as "System repair" instead of leaving the actor blank. Read-only UI change in the Recycle Bin page, no data touched.

Nothing above has been written to the database.
