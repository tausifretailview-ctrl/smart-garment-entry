# Step 2a dry-run v1 — review of the 22:01 IST paste (NO MUTATE)

Source: `docs/ssot-step2-group-b-dry-run-v1-live-2026-09-19-22-01-26.csv` (output of the
v1 `scripts/ssot-step2-group-b-dry-run-2026-09-19.sql`). Read-only; nothing was written.

Note on order: Step 1 (materialise the old "51" vs the 91) was asked for first and has
**not** been pasted yet. This paste is the Step 2a dry-run. It is safe to review — it
writes nothing — but Step 1 is still owed before any mutate, and the Step 1 SQL itself has
changed (see "Rule correction" below), so the earlier `scripts/ssot-step1-…` text must be
re-pasted, not the one from PR #792 as first pushed.

## Headline as pasted (v1 rule)

| | |
|---|---|
| Customers / bills | 49 / 57 (exactly the 21:09 Group B minus NET_DUE_ZERO minus DOLLY prediction) |
| Over-credit | ₹1,75,636.51 |
| Rows v1 would soft-delete | 46 receipts, ₹1,53,884 |
| Customers v1 called READY | 32 (38 bills; one more OK bill sits on a HOLD customer) |
| HOLD | 17 customers (bills: 16 HOLD_PARTIAL, 2 HOLD_RECON_MISMATCH) |

The membership matched the prediction to the rupee, so Group B selection is stable. The
**leg selection is not safe**, for three reasons found in the receipt rows.

## Defect 1 — at-sale tender was added in full (false positives)

The app deliberately writes a receipt for counter money in two situations:

- POS dual-write: `sales.cash_amount` AND a same-day receipt voucher for the same money
  (`saleSettlement.ts`, comment on `ensureAtSaleTenderReceipt`: "dual-written POS bills are
  untouched").
- The backfill `ensureAtSaleTenderReceipt` itself: description
  `Counter payment received for sale …`, `voucher_date` = sale date, created the moment a
  later receipt lands on a bill that has tender and no receipt yet.

The printed Customer Ledger nets those: `CustomerLedgerPage` credits
`residualPaymentAtSaleTender(sale, same-day receipts)` = `max(0, tender − same-day
receipts)`, then the receipts. `compute_sale_settlement` (GREATEST) and SNAP's
`paid_at_sale_drift` also never double-count them. The v1 scan (and the 21:09 full scan)
computed `receipts + tender − net_due` with the **full** tender, so every dual-written POS
bill looked over-credited by its own tender and every such "SNAP drop" was SNAP being
right.

The v1 CSV has no `sale_date`, so which of the 27 `RECEIPT_DUPLICATES_AT_SALE_TENDER`
bills in Group B are dual-writes cannot be read off it. Candidates from voucher timing alone: POS/26-27/1919
and /1971 (receipts 23 Jul 21:14, POS numbers of that week), /1947 (21 Jul 21:41 card,
₹8,400 of a ₹10,400 tender — looks like the card leg of a split tender), /1989 (22 Jul),
/2358 (26 Aug). These may not be duplicates at all.

Rule correction (applied to all three SQL files, tests updated):

```
tender_residual   = GREATEST(0, tender − Σ receipts with voucher_date = sale day IST)
over_credit       = GREATEST(0, receipts + tender_residual − net_due)
bucket-(g) drop   = GREATEST(0, tender_residual − GREATEST(0, tender − receipts_effective))
                  = ledger credit − SNAP credit
```

The last line also fixes a v2 understatement: v2 only counted a drop when
`receipts_after ≥ tender`. When `0 < receipts_after < tender` SNAP credits
`GREATEST(receipts, tender) = tender` while the ledger credits `tender + receipts`; the
drop is `receipts_after`, not 0 (DOLLY 454 = ₹1,500; POS/25-26/1214 = ₹3,750;
POS/26-27/2442 = ₹5,000). Those customers are Group A, not B.

Consequence: **the 21:09 A/B split is provisional.** v3 of the full scan must be pasted
before Group B is re-cut. Expect the population to shrink (dual-writes leave) and some B
customers to move to A (partial GREATEST drops).

## Defect 2 — any whole-redundant leg was deletable (over-reach)

v1 marked `DELETE_WHOLE` whenever `remaining_before ≤ 0.5`, regardless of what the leg
matched. Scoring the 46 v1 delete legs by what they echo:

| Echo class | Legs | ₹ | Meaning |
|---|---|---|---|
| echoes an earlier receipt on the bill (±1) | 13 | 70,686 | double submit — deletable |
| equals the counter tender (±1) | 10 | 23,084 | re-keyed counter cash — deletable **only if not same-day** |
| pair sums to an earlier leg | 3 | 10,000 | INV/25-26/799: 5,000+5,000 vs 10,000 — undecidable, HOLD |
| matches nothing | 20 | 50,114 | **not a duplicate of anything** |

The 20 non-echo legs: e.g. POS/25-26/678 ₹4,200 upi (20 Jul) on an ₹8,200 bill paid in
full at the counter; INV/26-27/157 ₹3,842 cash (18 Jun) on a ₹7,972 bill paid by UPI on
30 Apr; POS/26-27/2358 ₹4,289 on a ₹2,705 bill. Those are real payments referenced to the
wrong bill, or the counter tender was mis-keyed — either way the customer handed over the
money once and the fix is a re-reference or a tender correction decided by hand, not a
soft delete. Deleting them makes the balance right and the day book wrong.

Re-scoring v1's 32 READY customers with an echo-only rule (sale days unknown → assumed not
same-day):

- 19 customers / 24 bills / ₹1,03,770 have only echo legs. Of these, 10 customers / 11 bills /
  ₹62,916 are pure double submits with no tender involvement (416, 1089, 1621, 1116+292, 558,
  808, 1117, 610, 378, 821) — the strongest tier; INV/26-27/1089 is literally
  `RCP/26-27/2442` inserted twice in the same minute (the `#d…` suffix is the later
  voucher-number dedupe), INV/26-27/1117 is RCP/2858 + RCP/2859 same minute, and the
  30 May 17:04–17:10 Velvet batch (RCP/1131–1143) accounts for 8 legs.
- 13 customers / 14 bills / ₹39,614 were READY only because of a non-echo leg → HOLD.

## Defect 3 — same-minute pair with the echo first deleted the wrong leg

POS/26-27/2442: net ₹12,000, tender ₹7,000, receipts ₹7,000 then ₹5,000 (both 16 Sep
14:19). v1 walked chronologically: the ₹7,000 became PARTIAL, the ₹5,000 DELETE. The
₹7,000 *is* the tender re-keyed; the ₹5,000 is the balance. v2 marks the tender echo by
amount (one leg = `tender_residual` ±1, not on the sale day, `over_credit ≥ amount`),
excludes it from the running sum, and walks the rest. Same pattern: POS/26-27/1768
(₹1,000 + ₹400 on ₹1,400, tender ₹1,000).

## A fourth shape that is its own thread — `balance_adjustment` batch, 1 Jul 2026 15:25

Six ELLA NOOR invoices (INV/25-26/443, /733, /1413, INV/26-27/262, /341, /469) each carry
a receipt with `payment_method = 'balance_adjustment'`, created 2026-07-01 15:25, for
the **full** invoice value, on top of an earlier real part-payment. Over-credit
₹12,050. `_is_settlement_memo_receipt` does not exclude `balance_adjustment`, so these
count as cash everywhere (ledger, SNAP, C-JS). They are not duplicates from a cashier —
they are one batch write, and what it meant (write-off? migration? mistaken "mark paid")
has to be established before anything is done. v1 correctly held all six as PARTIAL;
v2 names them `HOLD_BALANCE_ADJUSTMENT` so they stop looking like ordinary overpays.

## Other holds that are right and should stay holds

- Instalment overpay inside one leg (INV/25-26/255 ₹639, INV/26-27/187 ₹363.30,
  INV/25-26/1229 ₹50, INV/25-26/779 ₹3,000 — the last is a ₹3,370 receipt on a ₹370
  remainder, almost certainly a multi-bill payment referenced to one bill).
- Tender itself exceeding the bill (POS/25-26/818 tender ₹1,500 on ₹1,200; POS/26-27/1851
  tender ₹1,000 on ₹400) — the tender-only population parked earlier, mixed with a receipt.
- POS/25-26/739: ₹900 receipt on a ₹300 net after a return — a refund owed, not a
  duplicate (same family as DOLLY 459/478).

## What changed in the repo

- `scripts/ssot-step2-group-b-dry-run-2026-09-19.sql` → **v2**: same-day netting; leg
  kinds `DUP_DOUBLE_SUBMIT` / `DUP_TENDER_REKEYED` (DELETE), `SAME_DAY_DUAL_WRITE` /
  `COUNTER_MATERIALISED` (KEEP), `BALANCE_ADJUSTMENT` / `NON_ECHO_REDUNDANT` / `PARTIAL`
  (HOLD); tender echo matched by amount; output now carries sale day, voucher date,
  description, `voucher_entries.id`, same-day sum and residual per bill.
- `scripts/ssot-51-full-sibling-scan-2026-09-19.sql` → **v3**: same rule; bucket-(g)
  drop = ledger − SNAP (catches the partial case).
- `scripts/ssot-step1-materialise-51-vs-91-2026-09-19.sql`: SET_91 uses
  `tender_residual`; `NEW_ONLY_AT_SALE_TENDER` reason likewise.
- Tests: `test/money/ssotStep2GroupBLegWalk.test.ts` (v2 rule, 20 cases),
  `test/money/ssot51FullSiblingScan.test.ts` (+ v3 cases). Both green.

## Order now

1. Paste **v3 full scan** → re-cut A/B (population will change).
2. Paste **Step 1** (rule-corrected) → reconcile old 51 vs the new set.
3. Paste **dry-run v2** → expect far fewer DELETE rows than 46; every DELETE row must be
   `DUP_DOUBLE_SUBMIT` or `DUP_TENDER_REKEYED` with a description that is not
   `Counter payment received for sale…`.
4. Five hand-checks across shapes (listed at the foot of the dry-run SQL), tag, soft
   delete by `voucher_entries.id`, invariant digest. Group A, Santosh, tender-only, and
   the 1 Jul `balance_adjustment` batch stay parked.

Mutate remains blocked.
