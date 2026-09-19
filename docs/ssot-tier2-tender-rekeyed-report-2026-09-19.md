# Tier 2 — receipt re-keyed over at-sale tender: REPORT for shop-by-shop review

**No deletion logic. No mutate script. Nothing here is approved for a write.**

7 customers / 11 bills / 11 receipt rows / ₹26,164 (dry-run v2, 22:25 IST 19 Sep 2026,
`docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv`). Live paste with names,
phones, who wrote each receipt, and both fixes spelled out per line:
`scripts/ssot-tier2-tender-rekeyed-report-2026-09-19.sql` (read-only).

## Why this tier is not a delete

Every bill below was booked as **paid at the counter** (`sales.cash_amount` / `card_amount` /
`upi_amount` = net), and then a receipt for the **same amount** was written on a later day.
The customer handed over the money once; the account is over-credited by exactly that amount.
Removing either record fixes the balance. The data cannot say which one is the phantom:

| | Explanation A — the receipt is wrong | Explanation B — the at-sale tender is wrong |
|---|---|---|
| What happened | Cashier used "Record Payment" on a POS bill that was already paid at the counter (re-key). | POS was rung as paid (cash_amount = net) but the customer actually paid on the receipt day (pay-later sold as paid). |
| Which record is true | at-sale tender | the receipt |
| Fix | soft-delete the receipt | tender correction: `sales.cash_amount` (or card/upi) reduced by the amount; receipt stays |
| Day book effect | receipt-day cash −₹X; sale day unchanged | sale-day cash −₹X; receipt day unchanged |
| Customer-facing | a receipt they may hold on paper disappears from the ledger | nothing they were given changes |
| Different from Tier 1 because | Tier 1 deletes a row that echoes **another receipt** — no version of events makes the second receipt real. Here the receipt echoes a **tender field**, and a wrong tender field is at least as common as a wrong receipt. | |

A tender correction is a different write path (sales row, not voucher_entries), with its own
trigger effects on `paid_amount` — it needs its own dry-run and protocol if the shop picks B.

## Per-customer list (IST; names from the dry-run where known — the SQL paste fills the rest)

Columns: bill · sale day · net = tender · receipt · receipt day · method · ₹ · gap.

### `dde74df8` HEENA PATEL (Velvet) — 4 bills, ₹12,456

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/1488 | 16 Jun | 6,290 | RCP/26-27/3263 | 31 Jul 13:05 | cash | 6,290 | 45 d |
| POS/26-27/1594 | 22 Jun | 2,547 | RCP/26-27/3264 | 31 Jul 13:06 | cash | 2,547 | 39 d |
| POS/26-27/1714 | 1 Jul | 849 | RCP/26-27/3265 | 31 Jul 13:06 | cash | 849 | 30 d |
| POS/26-27/853 | 12 May | 2,770 (tender **0**) | RCP/26-27/1132 | 30 May 17:05 | cash | 2,770 | echoes RCP/1124 (28 May) — **Tier-1 shape**, held here by customer-atomicity |

Three consecutive receipts (3263–3265) written in **one minute on 31 Jul** against three bills
from June–July — all "paid at counter" per the sale rows. Either the cashier re-keyed three
already-paid bills in a row (A), or HEENA settled a running tab of ₹9,686 on 31 Jul for three
bills that had been rung as paid (B). B is plausible for a regular customer with four bills in
the population; the shop will know. Ask: *"Did Heena pay ₹9,686 on 31 Jul?"* If yes → B on all
three (tender corrections), and RCP/1132 on 853 is then a clean Tier-1 double.
Also a multi-bill hand-check whichever way — she was the Group-B poster case in the scan.

### `1b55c8fa` (Velvet) — 2 bills, ₹1,645

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/1919 | 30 Jun | 442.005 / 442 | RCP/26-27/3109 | 23 Jul 21:14 | cash | 442 | 23 d |
| POS/26-27/1971 | 1 Jul | 1,203 | RCP/26-27/3110 | 23 Jul 21:14 | cash | 1,203 | 22 d |

Two receipts in the same minute on 23 Jul for two bills from 30 Jun / 1 Jul. Same pattern as
HEENA (settling a tab vs re-keying). 1919 carries the ₹0.005 paise rounding that the 0.5
tolerance now ignores.

### `3c2e5760` (Velvet) — 1 bill, ₹4,500

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/513 | 2 May | 4,500 | RCP/26-27/27#d00d54bbb | 6 May 21:33 | cash | 4,500 | 4 d |

The `#d…` suffix means this receipt's number collided with another RCP/26-27/27 and was
renamed — an early-April/May numbering artefact, not evidence either way.

### `7fb7d5d7` (Velvet) — 1 bill, ₹1,205

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/1047 | 24 May | 1,205 | RCP/26-27/2965 | 18 Jul 19:50 | cash | 1,205 | 55 d |

Longest gap in the tier. 55 days after a bill rung as cash-paid is a long time to re-key by
accident; also a long time to leave a tab open. Ask the shop.

### `a3815bf9` (Velvet) — 1 bill, ₹1,595

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/851 | 12 May | 1,595 | RCP/26-27/22#dd2c696bc | 16 May 16:57 | cash | 1,595 | 4 d |

### `a52e9c66` (Velvet) — 1 bill, ₹763

| Bill | Sale day | Net = tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/2250 | 11 Jul | 763 | RCP/26-27/3186 | 25 Jul 21:31 | cash | 763 | 14 d |

### `e90adfd4` (Velvet) — 1 bill, ₹4,000

| Bill | Sale day | Net / tender | Receipt | Written | Method | ₹ | Gap |
|---|---|---:|---|---|---|---:|---|
| POS/26-27/270 | 13 Apr | 5,000 / 5,000 | RCP/26-27/3#de671e936 (KEEP) | 13 Apr 20:05 | — | 1,000 | sale day — dual-write, nets against tender |
| | | | RCP/26-27/4#d5eeb20ff | 14 Apr 17:13 | — | 4,000 | 1 d — equals residual tender 5,000 − 1,000 |

The only split case: tender 5,000, a same-day receipt of 1,000 (POS dual-write, kept), then
4,000 the next evening = exactly the residual. Reads naturally as B (₹1,000 down at the
counter, ₹4,000 the next day, POS rung as fully paid) — but that is a reading, not evidence.

## Totals

| Customer | Bills | ₹ |
|---|---:|---:|
| HEENA PATEL `dde74df8` | 4 | 12,456 |
| `3c2e5760` | 1 | 4,500 |
| `e90adfd4` | 1 | 4,000 |
| `1b55c8fa` | 2 | 1,645 |
| `a3815bf9` | 1 | 1,595 |
| `7fb7d5d7` | 1 | 1,205 |
| `a52e9c66` | 1 | 763 |
| **Total** | **11** | **26,164** |

All seven are Velvet POS bills; every receipt but two (`e90adfd4`'s blank-method pair) is
`cash`. The sale rows' `payment_method` and the receipt writer's login (`method_hint`,
`receipt_written_by` in the paste) are the two pieces of evidence the CSV did not carry. A
bill rung as **upi/card** at the counter with a **cash** receipt later is a flag for the
reviewer, not proof for A or B — it only says the receipt is not a straight re-key of the
same tender line. Read it with the shop.

## What happens next (not tonight)

1. Paste the SQL; save the CSV next to this file.
2. Shop review, one line per bill: A or B (or "both real — customer overpaid, refund due", which
   would move the bill to the refund shape, not a delete).
3. A-answers become a Tier-1-style soft-delete set with its own dry-run + hand-checks.
   B-answers become a tender-correction set — new script, new protocol, own dry-run.
4. HEENA's RCP/26-27/1132 (₹2,770) is released to Tier-1 shape as soon as her three re-keyed
   bills have an answer either way. Tracked in `roadmap.md` with ANANYA's ₹11,294.
