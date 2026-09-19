# v3 scan · Step 1 · dry-run v2 — the 22:24 / 22:24 / 22:25 IST pastes (NO MUTATE)

Files: `docs/ssot-51-full-sibling-scan-v3-live-2026-09-19-22-24-37.csv`,
`docs/ssot-step1-51-vs-91-live-2026-09-19-22-24-58.csv`,
`docs/ssot-step2-group-b-dry-run-v2-live-2026-09-19-22-25-17.csv`. All read-only.

## 1. v3 full scan — the corrected population and split

| | v2 (21:09) | **v3 (22:24)** |
|---|---|---|
| Over-credited bills, 4 orgs | 456 | 450 |
| Receipt-bearing | 91 / ₹2,98,108.51 | **85 / ₹2,80,818.51** |
| A `NEEDS_BUCKET_G` | 14 customers / 25 bills | **17 customers / 30 bills / ₹75,703** |
| B `REPAIR_SUFFICIENT_SNAP` | 52 / 62 | **43 / 51 / ₹1,75,880** |
| `SANTOSH_SEPARATE` | 2 bills | 2 bills / ₹11,500 |
| `WALK_IN_NO_CUSTOMER` | 2 | 2 / ₹17,736 |

**Six bills (₹16,290) left the population as same-day dual-writes** — the v1 dry-run would
have deleted four of them (POS/25-26/430 ₹700, POS/25-26/542 ₹400, POS/26-27/1989 ₹3,690,
POS/26-27/2442 ₹5,000). The other two are ELLA NOOR POS/26-27/93 — literally the
`ensureAtSaleTenderReceipt` example in `saleSettlement.ts` (₹4,000 counter cash + ₹16,900
UPI) — and POS/26-27/1820. Nothing wrong with any of them.

Gate moves, v2 → v3:

- **ANANYA left A → B.** Her "sibling" POS/26-27/1788 (tender ₹2,416 + receipts ₹12,416 on
  ₹14,832) has the ₹2,416 receipt dated the sale day: it *is* the tender. Residual 0, drop 0.
  The 20:10 conclusion "ANANYA must not be treated as repair-the-duplicate-done" was a v2
  artifact. Her four 30 May double submits (POS/26-27/221, /536, /580, /70; ₹11,294) are
  clean; she is held today only by POS/26-27/1787 (see §3).
- **Joined A** via the partial GREATEST hole (`0 < receipts_after < tender`): DOLLY (454,
  ₹1,500), `32d34671` (POS/25-26/1214, ₹3,750), `22e086fa` (POS/26-27/1753, ₹700),
  `9c324a1a` (POS/26-27/1768, ₹400).
- **Two false A's** from paise rounding: `1b55c8fa` (POS/26-27/1919 tender ₹442 vs net
  ₹442.005 → "drop" ₹0.005) and `70a1d1cc` (₹0.0005). The scan gate was `> 0`; the dry-run
  gate was `≤ 0.005`, which is why the dry-run counted 53 B bills against the scan's 51.
  Both SQLs now use **₹0.5**. With that, B = 45 customers / 55 bills (the dry-run's 43 / 53
  are B minus the two NET_DUE_ZERO refund rows).
- A's surviving at-sale drop after a perfect duplicate repair: **₹20,900 on the repair bills
  themselves + ₹10,324 on 9 sibling bills = ₹31,224** across 17 customers (SHREEVASTAV 824
  ₹500, `b9bd7c57` three siblings ₹4,600, `20579620` POS/26-27/1409 ₹2,324 …). ANANYA's
  ₹2,416, POS/93's ₹4,000 and 1820's ₹500 from the v2 figure were never real.

## 2. Step 1 — where "51" came from, closed

| | Bills | ₹ |
|---|---|---|
| OLD_51 rule replayed live (CN-netted receipts − net_due > 1, no tender, advance memos counted as cash) | **51** | ₹1,63,085.61 |
| Corrected set (memo-excluded receipts + residual tender − net_due > 1) | 85 | ₹2,80,818.51 |
| BOTH | 48 | old ₹1,62,085.61 / new ₹1,82,927.11 |
| OLD_ONLY_ADVANCE_MEMO | 3 | ₹1,000 old / ₹0 new |
| NEW_ONLY_AT_SALE_TENDER | 37 | ₹97,891.40 |

**The count 51 reproduces exactly** under the reconstructed old rule. The rupee figure does
not: those 51 bills sum to ₹1,63,086 under their own rule, not ₹2,99,467, and no rule tried
reproduces ₹2,99,467. Treat "₹2,99,467" as an unreconciled hand figure; the population is
now defined by `sale_number` in the Step 1 CSV.

- **3 bills in the old 51 that are not real** — all `aacca229` (ELLA NOOR INV/25-26/585,
  /856, /1194): the only "receipts" are advance-application memos (₹21,000 / ₹5,050 /
  ₹10,200). Cash receipts = 0. Nothing to delete; correctly dropped.
- **37 bills the old headline missed entirely** — every one is the GREATEST hole: receipts
  alone ≤ net, receipts + at-sale tender > net. Includes HEENA 1488/1594/1714, SANTOSH 717,
  VIMLA 765, DOLLY 454, ANANYA 1787, and 19 of today's B bills. The old rule never added
  tender, so it could not see a receipt keyed on a bill already paid at the counter.
- **12 BOTH bills carry a higher ₹ under the new rule** — the tender. SHREEVASTAV 875:
  ₹2,100 old → ₹3,100 new, i.e. exactly the "+₹1,000 SHREEVASTAV correction" that turned
  ₹2,98,467 into ₹2,99,467 on 19 Sep. The same correction applies to 11 more bills.

Nothing from the old list is dropped silently (3 explained) and nothing is double-handled
(48 are the same `sale_number` rows).

## 3. Dry-run v2 — what a mutate would actually do now

Headline: 43 customers / 53 bills / over-credit ₹1,77,074.51 → **27 receipt rows / ₹1,05,374**
would be soft-deleted; **17 customers READY** (22 bills, 22 rows, ₹89,080), 26 HOLD.
For every OK bill, predicted `paid_amount` after repair equals live `paid_amount`, i.e.
`compute_sale_settlement` had already absorbed the duplicate — the mutate is ledger-only,
and `paid_diverges_from_receipts` should fall, not rise.

Every DELETE row is `Payment received for POS sale …` / `Payment received for invoice …`.
None is `Counter payment received for sale`, none is a memo, none is `balance_adjustment`.

### READY splits into two tiers by evidence strength

**Tier 1 — `DUP_DOUBLE_SUBMIT` only: 10 customers / 11 bills / 11 rows / ₹62,916.**
Second receipt of the same amount on the same bill, bill already at zero. No tender
involved, so there is no "which record is wrong" question.

| Customer | Bill | Delete | Evidence |
|---|---|---|---|
| `1ad6cd52` | POS/26-27/416 | RCP/26-27/1137 ₹2,000 | 30 May 17:08 batch; original 25 Apr |
| `2fcbb26b` | INV/26-27/1089 | RCP/26-27/2442#d791657cc ₹5,250 | same voucher number inserted twice at 21:13 |
| `526460c5` | INV/26-27/1621 | RCP/26-27/1838 ₹250 | 1836 at 20:37, 1838 at 20:38 |
| `71b043b8` | POS/26-27/1116, /292 | RCP/1133 ₹5,570, RCP/1141 ₹570 | 30 May batch |
| `721fd1c2` | POS/26-27/558 | RCP/1143 ₹3,300 | 30 May batch |
| `8538501f` JATIN | POS/26-27/808 | RCP/1131 ₹13,700 | 30 May batch |
| `933ba20a` | INV/26-27/1117 | RCP/2859 ₹3,150 | 2858/2859 same minute |
| `ae7d0c17` | POS/26-27/610 | RCP/1135 ₹2,299 | 30 May batch |
| `c25acad2` | POS/26-27/378 | RCP/1142 ₹1,977 | 30 May batch |
| `fd857b39` | INV/25-26/821 | RCP/25-26/937 ₹24,850 | 936 at 22:13, 937 at 22:28 |

**Tier 2 — includes `DUP_TENDER_REKEYED`: 7 customers / 11 bills / 11 rows / ₹26,164.**
Bill paid in full at the counter per `cash_amount`, then a receipt for the same amount days
or weeks later (`1b55c8fa` 1919/1971, `3c2e5760` 513, `7fb7d5d7` 1047, `a3815bf9` 851,
`a52e9c66` 2250, HEENA 1488/1594/1714 + her 853 double, `e90adfd4` 270). The customer paid
once — but the data cannot say whether the wrong record is the **receipt** (cashier re-keyed
money already taken) or the **`cash_amount` at sale** (POS booked cash that was actually
collected later). Deleting the receipt fixes the balance either way; if the truth is the
second, it moves ₹ from the receipt day to the sale day in the day book and removes a
voucher the customer may hold. Tier 2 needs the shop to confirm per bill, or a tender
correction (`sales.cash_amount`) instead of a delete — a different write, different
protocol. HEENA is the multi-bill hand-check whichever way.

### HOLD — 26 customers / 31 bills / ₹87,994 over-credit

| Hold | Customers | What it is |
|---|---|---|
| `HOLD_NON_ECHO_REDUNDANT` | 16 | a leg that matches nothing: ₹4,200 on an ₹8,200 counter-paid bill (678), ₹3,842 cash on a UPI-paid bill (157), ₹4,289 on a ₹2,705 bill (2358), ₹8,400 card on a ₹10,400 bill (1947)… Real payments on the wrong bill or mis-keyed tender. Re-reference, not delete. ANANYA sits here because of 1787 (₹7,584) while her four clean doubles wait. |
| `HOLD_BALANCE_ADJUSTMENT` | 6 | the 1 Jul 2026 15:25 ELLA NOOR batch (₹12,050) — own thread |
| `HOLD_PARTIAL` | 4 | overpay inside one instalment (INV/25-26/1229 ₹50, INV/25-26/255 ₹639, INV/25-26/779 ₹3,000, INV/26-27/187 ₹363) — refund/credit, not duplicate |

Customer-atomic holds cost ₹11,294 of clean ANANYA doubles and ₹5,000 on INV/25-26/799
(`3063c897`: RCP/912 is a clean double of RCP/911, but 911 itself is the undecidable
5,000+5,000-vs-10,000 leg). Keeping the rule; noting the cost.

## Recommendation for the first mutate

Tier 1 only: 10 customers, 11 receipt rows, ₹62,916. Hand-checks (five, across shapes):
INV/26-27/1089 (same voucher number twice), INV/25-26/821 (15 min apart, ₹24,850 — the
largest), POS/26-27/808 (30 May batch, card), INV/26-27/1621 (₹250, one minute apart),
`71b043b8` (two bills on one customer). Tag `[dup_receipt_repair_20260919]` in
`description`, soft delete by `voucher_entries.id` from the CSV `i` column, then the
invariant digest. Tier 2 waits for the shop. Group A waits for bucket (g). Santosh,
tender-only, `balance_adjustment` batch: parked.

Mutate script not yet written. Hold stays until this split is approved.
