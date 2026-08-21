# Reversing the June credit-note repair batches — ELLA NOOR

Phases 0 and 1 are done (read-only). The results change the scope: the 1 June batch must not be reversed, and most of the 6 June batch is now blocked.

## Phase 0 — the 1 June batch is NOT the same thing

Window `2026-06-01 18:00:00+00` to `18:01:00+00`, 17 receipts, all `credit_note_adjustment`.

**Every one of the 17 rows has `sale_return_adjust > 0`, and in every row the adjustment equals the deleted receipt exactly.** Examples: RCP/1042 ₹3,250 on INV/1020 (SRA 3,250), RCP/873 ₹12,150 on INV/181 (SRA 12,150), RCP/926 ₹8,600 on INV/807 (SRA 8,600).

For all 17: `paid_amount` = live surviving receipts, and `paid_amount + sale_return_adjust = net_amount`, status `completed`. These deletions removed a genuine double count. Three-way split: 17 justified, 0 no-receipt-unpaid, 0 understated.

No receipt and no sale is shared between the two batches (0 overlap on `reference_id`).

**Conclusion: do not reverse the 1 June batch. It is excluded entirely.**

## Phase 1 — the compounding check blocks most of the 6 June batch

A third, later operation exists that the brief did not account for: **on 2026-07-01, sixteen `balance_adjustment` receipts (RCP/2412–RCP/2428) were booked for exactly these customers**, in amounts matching the deleted credit — 13,500 (AMNA), 10,500 (MAHENOOR), 8,600 (OSAMA), 11,300 (Sharmin), 4,500 (SAMEENA), 3,950 (Naeem), 3,600 (Nazbin), 3,200 (Sadiqa), 3,200 (Muskan), 1,800 (SABINA), 9,200 (Amrin), 3,100 (AYESHA), 4,400 (PRIYANKA), 6,500+5,650 (Ruby).

For 14 of those the July adjustment lands on the **same sale** the 6 June receipt was deleted from, and that sale's `paid_amount` now equals the July amount. The credit has already been re-granted. Restoring the original receipt there would credit the same money twice.

Two need separate handling because the July credit went to a *different* invoice than the deletion:
- **Ruby Bhatia** — deletions on INV/529 and INV/322; July credit on INV/1807 and INV/1336. Total risk of over-application against SR/26-27/13 (net 6,200).
- **Muskan** — deletion of 8,900 on INV/1374 (still pending, 0 paid) plus 3,200 on INV/327; only the 3,200 was re-granted.

**Blocked and excluded from any write: all 17 rows whose customer received a 2026-07-01 balance adjustment.**

**Remaining candidate set — 11 rows, ₹49,600, no July adjustment, invoice has no live receipts and shows unpaid:**

| Customer | Deleted receipt | Invoice | Net | Paid now |
|---|---|---|---|---|
| Arezah Nathani | RCP/26-27/61 ₹3,150 | INV/25-26/1224 | 3,150 | 0 |
| Arezah Nathani | RCP/26-27/62 ₹50 | INV/25-26/1229 | 3,100 | 0 |
| FIZA CHAUDHARY | RCP/26-27/414 ₹4,500 | INV/26-27/119 | 4,500 | 0 |
| GULNAZ | RCP/26-27/337 ₹10,500 | INV/26-27/296 | 10,500 | 0 |
| KHADIJA SHEIKH | RCP/26-27/438 ₹4,500 | INV/25-26/903 | 4,500 | 4,500 |
| KHADIJA SHEIKH | RCP/26-27/439 ₹650 | INV/25-26/856 | 5,050 | 650 |
| KHADIJA SHEIKH | RCP/26-27/440 ₹100 | INV/25-26/1194 | 10,200 | 100 |
| Mahi Supariwala | RCP/25-26/1873 ₹6,500 | INV/25-26/1526 | 6,500 | 0 |
| QURRATUL AIN BANGALORE | RCP/26-27/587 ₹7,500 | INV/26-27/398 | 11,500 | 4,000 |
| Sadiya Surat | RCP/26-27/408 ₹3,200 | INV/26-27/310 | 3,200 | 0 |
| Shanawaz Memon | RCP/26-27/96 ₹7,000 | INV/25-26/1361 | 7,000 | 0 |

The three KHADIJA rows carry the collapse bug (`paid_amount` equals the deleted receipt), so they need the recompute, not just the restore.

## Phase 2 — questions for the shop (blocking)

1. **Hanif bhai / SR/26-27/11** — ₹6,250 return against a ₹3,200 invoice. Was the ₹3,050 remainder paid out in cash/UPI outside the software? If yes, on what date (a refund voucher gets booked on that date); if no, it stays as available credit.
2. Same question for the other returns whose net exceeds the credit that was applied:

| Customer | Return | Return net | Applied | Remainder |
|---|---|---|---|---|
| Muskan | SR/25-26/58 | 12,100 | 8,900 | 3,200 |
| Arezah Nathani | SR/26-27/4 | 3,200 | 50 | 3,150 |
| GULNAZ | SR/26-27/12 | 11,250 | 10,500 | 750 |
| PRIYANKA YADAV | SR/26-27/9 | 4,400 | 3,900 | 500 |
| Ruby Bhatia | SR/26-27/13 | 6,200 | 5,800 | 400 |
| FIZA CHAUDHARY | SR/26-27/19 | 4,700 | 4,500 | 200 |

3. **The 2026-07-01 balance adjustments** — were those a deliberate, owner-approved repair? If they were not, the correct fix may be to reverse *them* rather than restore the June receipts. This decides the fate of the 17 blocked rows.

## Phase 3 — the reversal (writes, only after sign-off, outside shop hours)

Scope: the 11 rows above only, minus anything the shop flags in Phase 2.

1. Snapshot the before-state of the affected receipts, sales and returns to a CSV attached to the sign-off.
2. Clear `deleted_at` / `deleted_by` on those exact receipt rows. No new voucher numbers.
3. Recompute `paid_amount` / `payment_status` per sale through `compute_sale_settlement` — dry-run on three rows first (one KHADIJA collapse row, one zero-paid row, QURRATUL's partial) and confirm the result equals `LEAST(net_amount, tenders + live receipts)` before applying to the rest.
4. Set `sale_returns.credit_available_balance` on each affected return to the true remainder (net minus applied), per the Phase 2 answers.
5. Tag every touched row with `reversal_of_cn_over_apply_repair_20260606`, and log the batch to `balance_reconciliation_log`.
6. Verify: the 11 invoices settle to `LEAST(net, tenders + live receipts)`; the 17 blocked rows are untouched; no customer statement shows an amount already paid; `paid_diverges_from_receipts` count for this org drops for the repaired rows.

Not done as part of this: `reconcile_customer_balances`, `fix_stock_discrepancies`, or any change to `compute_sale_settlement` / `resolveCnAvailableFromRows`.
