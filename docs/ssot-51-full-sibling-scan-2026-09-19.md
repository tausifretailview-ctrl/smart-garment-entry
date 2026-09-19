# Full 51-set sibling SNAP-drop split — 19 Sep 2026

**Hold the mutate.** Guard stays LIVE. Do not reverse 1126 / 1128 / 1129 / 1131-2 / Velvet 1131–1145.

The 20:10 IST 18-bill scan proved bucket (g) is live on HEENA and ANANYA siblings. This pass extends that check to the **full leftover-sum over-credit population** (the 51-set’s four orgs), and splits customers **before** any delete.

Tables-only paste: `scripts/ssot-51-full-sibling-scan-2026-09-19.sql`. No JWT. No `organizations.deleted_at`.

---

## Correction — SHREEVASTAV / VIMLA / DIYA are not “repair sufficient”

They do **not** belong in the duplicate-only group.

| Customer | Why bucket (g) survives the duplicate delete |
| --- | --- |
| **SHREEVASTAV** POS/875 | SNAP drop **on the repaired bill** (tender ₹1,000, remaining RCP/799 ₹2,100) **and** sibling POS/824 ₹500 |
| **VIMLA** POS/765 | SNAP drop **on the repaired bill** (tender ₹400, remaining RCP/1125 ₹2,600). No extra sibling needed. |
| **DIYA** POS/123 | SNAP drop **on the repaired bill** (tender ₹1,000, remaining ₹10,000) |

ANANYA is the sibling-only shape (repaired rows tender=0; POS/1788 drops at-sale with nothing to delete). SHREEVASTAV is **both** shapes. A delete that only removes 1128/1129 / 1126 / 1145 still leaves POS search wrong.

HEENA looked sibling-only in the 18-bill scan, but the 21:09 full scan shows her "siblings" 1488/1594/1714 are themselves receipt-on-top-of-at-sale duplicates — see **HEENA moves** below. She is B only if all four bills are repaired together.

---

## Three gates (not two)

| Gate | Meaning | 18-bill live lock (20:10 IST) | Mutate? |
| --- | --- | --- | --- |
| **SANTOSH_SEPARATE** | 1131-1 leftover-overpay on POS/1130. Not SNAP. Do not fold into A or B until that row is settled on its own. | POS/717 customer `1167547a…` | **No** |
| **NEEDS_BUCKET_G** | After excluding leftover-sum over-credit on **every** repair bill of the customer, SNAP still drops at-sale on any of her sales (`tender > 0` and remaining receipts `≥ tender`). Customer-level. | SHREEVASTAV, VIMLA, DIYA, ANANYA (1788 ₹2,416) + 10 more — 14 customers / 25 bills in the 21:09 scan. HEENA **left** this gate (her drops were the duplicates themselves). | **No** until SNAP `paid_at_sale_drift` is fixed |
| **REPAIR_SUFFICIENT_SNAP** | No SNAP drop anywhere on the customer after repair. Duplicate delete would not leave a bucket-(g) POS-search hole **on this defect**. Customer-atomic. Still not a green light: 51-list reconciliation, NET_DUE_ZERO exclusion, hand-check, Velvet reprints. | JATIN, RUCHI, SURESH, REKHA, NIKKI, SAYALI, HEENA (all 4 bills) — 52 customers / 62 bills; 49 / 57 after NET_DUE_ZERO and DOLLY leave | **No** until step 1–2 of the order below |
| **WALK_IN_NO_CUSTOMER** | Velvet POS/85. No C-JS/C-SNAP customer. | POS/85 | Held with Velvet reprints |

Repair membership in the paste is **leftover-sum** over-credit, not `GREATEST(receipts, tender)`:

```
over_credit_ledger = GREATEST(0, non-memo receipts + tender − (net − SRA))
repair bill if over_credit_ledger > 1
```

GREATEST is what first called VIMLA clean and SHREEVASTAV ₹2,100. Headline may not print exactly 51 / ₹2,99,467 — paste the CSV anyway; that count is the point of the scan.

---

## LIVE RESULT — 19 Sep 2026 21:09 IST paste (`docs/ssot-51-full-sibling-scan-live-2026-09-19-21-09-22.csv`)

**Still no mutate.** Headline: **456 bills / ₹5,72,161.59** leftover-sum over-credit across the four orgs — not 51. The detector adds at-sale tender to credit, so it also catches every bill where at-sale cash was keyed above the net (round-off / change), which has **no receipt to delete**. Those must be split off first:

| Population | Bills | Over-credit | Note |
| --- | --- | --- | --- |
| Tender-only over (`receipts = 0`) | **365** (327 walk-in + 38 named) | ₹2,74,053 | At-sale cash > net. Nothing to delete. Not the duplicate-receipt problem. Separate population, park it. |
| **Receipt-bearing over-credit** (`receipts > 0`) | **91** | **₹2,98,108.51** | This is the duplicate-receipt population. ₹ matches the historical **51 / ₹2,99,467** headline to within ₹1,358; the *count* does not (91 vs 51). The 51 list by `sale_number` was never committed — only the headline. Reconcile by sale number before any row is touched. |

### Split of the 91 receipt-bearing bills (customer-level gate)

| Gate | Customers | Bills | Over-credit | Mutate? |
| --- | --- | --- | --- | --- |
| **A — NEEDS_BUCKET_G** | **14** | **25** | ₹86,738 | **No.** After every repair bill on the customer has its over-credit removed, SNAP still drops at-sale cash on the repaired bill or a sibling. Duplicate delete alone leaves POS search wrong. |
| **B — REPAIR_SUFFICIENT_SNAP** | **52** | **62** | ₹1,82,134.51 | **Not yet.** No SNAP drop survives — *only if every repair bill on the customer is repaired together*. Still needs the 51-list reconciliation, hand-check, and the NET_DUE_ZERO exclusion below. |
| SANTOSH_SEPARATE | 1 | 2 | ₹11,500 | No. 1131-1 leftover-overpay on POS/1130 still open. |
| WALK_IN_NO_CUSTOMER | — | 2 | ₹17,736 | Velvet POS/26-27/85 ₹15,862 exact double (held with Velvet reprints); Velvet POS/25-26/118 tender ₹937 + receipt ₹937 on a **fully-returned** bill → refund shape, hand-check. |

Per-bill gating gave `54572eba` one bill in each group (POS/26-27/1126 drop ₹2,500, POS/26-27/1023 clean). The gate is now **per customer** — she is A. SQL v2 rolls up the same way.

### Group A — 14 customers / 25 bills (every one is a genuine bucket-(g) survivor)

Every sibling carrying a drop has `over_credit_ledger = 0` (no duplicate to delete — SNAP simply discards the at-sale leg), and every `snap_drop_self` is measured **after** the over-credit is removed. So none of these drops is caused by the duplicate; all 25 survive the delete.

| Customer | Repair bills | Drop after repair | Where |
| --- | --- | --- | --- |
| SHREEVASTAV `3a4ef881` | POS/25-26/875 | ₹1,000 self + ₹500 sibling POS/26-27/824 | both shapes |
| VIMLA `c085667a` | POS/26-27/765 | ₹400 self | self |
| DIYA `ff3547a1` | POS/25-26/123 | ₹1,000 self | self |
| ANANYA `0616f278` | 1787, 221, 536, 580, 70 | ₹2,416 sibling POS/26-27/1788 (`oc = 0`, bill legitimately ≥ ₹14,832) | sibling |
| `5d17dd09` | 1326, 1361, 1579, 2023, 771, 849 (**6 bills**) | ₹1,000 self on 771 + ₹200 sibling POS/26-27/1360 | both |
| `b9bd7c57` | 667, 1522, 718 | ₹4,600 across 3 siblings (POS/25-26/172 ₹3,000, POS/26-27/25 ₹500, POS/26-27/738 ₹1,100) | sibling |
| `823962af` | POS/25-26/714 | ₹1,000 self + ₹1,500 sibling POS/25-26/470 | both |
| `54572eba` | 1126, 1023 | ₹2,500 self on 1126 | self |
| `0e55c65b` | POS/26-27/1363 | ₹500 sibling POS/26-27/1655 | sibling |
| `07e95598` | POS/25-26/134 | ₹3,000 self | self |
| `3ba2dcc5` | POS/26-27/93 (the `ensureAtSaleTenderReceipt` comment case) | ₹4,000 self | self |
| `c6633e62` | POS/26-27/185 | ₹3,000 self | self |
| `a6aad82f` | POS/26-27/1297 | ₹1,000 self | self |
| `e3fdc1db` | POS/26-27/1820 | ₹500 self | self |

Bucket-(g) total that survives a perfect duplicate repair on these 14: **₹28,116** of at-sale cash SNAP will still not credit.

### HEENA moves — but only as a 4-bill customer repair

The 20:10 scan gated HEENA `dde74df8` NEEDS_BUCKET_G on siblings 1488 + 1594 + 1714 (₹9,686). This scan shows those three are **themselves over-credited**: tender = receipt = net on each (₹6,290 / ₹2,547 / ₹849). The "sibling SNAP drop" was the duplicate receipt sitting on top of at-sale cash, not an independent bucket-(g) defect. Remove the over-credit on all four bills (853 + 1488 + 1594 + 1714) and no drop survives → **B**. Repair only 853 (the one that looked like the 51) and the ₹9,686 stays. Same rule applies to every multi-bill customer in B:

`dde74df8` HEENA (4), `bc266355` DOLLY (3), `32d34671` (2), `71b043b8` (2), `70a1d1cc` (2), `22e086fa` (2), `1b55c8fa` (2). **B is customer-atomic**: either all repair bills on the customer, or none.

ANANYA does **not** move: her sibling POS/26-27/1788 has `over_credit_ledger = 0` (₹2,416 at-sale + ₹12,416 receipts on a ₹14,832 bill). Nothing to delete; pure bucket (g). She stays A.

### Shapes inside the 91 — what "repair" would even mean

| Shape | Bills | Meaning | Delete a receipt? |
| --- | --- | --- | --- |
| EXACT_DOUBLE_RECEIPT (tender 0, receipts = 2 × net) | 18 | classic keyed-twice | yes, one leg |
| RECEIPT_OVER_PARTIAL (tender 0, receipts > net, not double) | 20 | extra/partial repeat | yes, the excess leg — hand-check which |
| RECEIPT_DUPLICATES_AT_SALE_TENDER (tender > 0, receipts ≤ over-credit) | 34 | bill zero at sale, receipt keyed anyway (Shreevastav 1128/1129, HEENA 1488) | one leg is wrong — **which** (at-sale or receipt) is a hand-check |
| MIXED_TENDER_PLUS_RECEIPT_OVER | 14 | tender + receipts > net, receipts alone ≤ net | mostly A; the excess is the at-sale leg |
| **NET_DUE_ZERO** (net − SRA = 0, receipt still standing) | **5** | bill fully returned; customer paid and is owed a refund/CN. **Not a duplicate.** | **No.** Deleting the receipt erases real money. `30615061` POS/26-27/686, `30d72f5a` POS/26-27/1002, DOLLY `bc266355` POS/26-27/459 + 478 (₹1,599 each), Velvet walk-in POS/25-26/118 |

The 5 NET_DUE_ZERO rows sit inside B by the SNAP gate but must be **pulled out of any receipt-delete plan**. That leaves B at **57 bills / 49 customers** eligible for the duplicate repair path (DOLLY drops to 454 only, which was already hand-cleared as genuine instalments — so DOLLY leaves B entirely).

### Order, once the hold lifts

1. Materialise the 51 by `sale_number` and diff against the 91. Anything in the 51 but not in the 91, or vice versa, is explained before step 2. → paste `scripts/ssot-step1-materialise-51-vs-91-2026-09-19.sql`; notes in `docs/ssot-step1-51-vs-91-reconciliation-2026-09-19.md`. **Awaiting CSV.**
2. B minus NET_DUE_ZERO minus DOLLY: customer-atomic dry-run, 5 hand-checks across different shapes, tag `[dup_receipt_repair_20260919]`, soft delete, invariant digest. → dry-run prepared, read-only: `scripts/ssot-step2-group-b-dry-run-2026-09-19.sql` (leg rule locked in `test/money/ssotStep2GroupBLegWalk.test.ts`). Not run until step 1 is reviewed. Mutate script not written.
3. A: **not until** SNAP `paid_at_sale_drift` (bucket g) is fixed; then the same dry-run. Repairing A now moves the wrong number from the ledger to POS search.
4. Santosh: own thread.
5. Tender-only 365: separate population, separate design (it is at-sale cash keyed high, not a receipt).

---

## What the paste must return

1. **headline** row: bill count, sum of `over_credit_ledger`, counts per gate.
2. **bill** rows: every leftover-sum over-credit sale in GURUKRUPA / VELVET / ELLA NOOR / KS FOOTWEAR, with `gate`, `snap_drop_self`, `sibling_snap_drop`.
3. **sibling** rows: other invoices on those customers with SNAP drop (HEENA 1488 class).

Until that CSV is locked, **no bill in the 18 or the 51 is approved to mutate.** A repair that fixes the named duplicate but leaves POS search wrong on a sibling is not a completed customer fix.

**headline row column map** (UNION reuses bill names): `tender` = bill count, `paid_amount` = sum leftover-sum over-credit, `receipts_live` = NEEDS_BUCKET_G count, `over_credit_ledger` = REPAIR_SUFFICIENT_SNAP count, `over_credit_greatest` = SANTOSH_SEPARATE count, `receipts_after` = WALK_IN count.

---

## Split rule (locked, v2 — customer-level)

```
if Santosh POS/717 or POS/1130 → SANTOSH_SEPARATE
else if no customer_id → WALK_IN_NO_CUSTOMER
else if receipts_live = 0 → TENDER_ONLY (not a receipt repair; separate population)
else if net − SRA = 0 → NET_DUE_ZERO (refund owed; never delete the receipt)
else if SUM over ALL the customer's sales of snap_drop(tender, receipts after
        every repair bill's over-credit is removed) > 0 → NEEDS_BUCKET_G
else → REPAIR_SUFFICIENT_SNAP  (customer-atomic: all her repair bills or none)
```

Do not put SHREEVASTAV / VIMLA / DIYA in REPAIR_SUFFICIENT_SNAP. Do not fold SANTOSH into either SNAP group. Do not repair HEENA 853 without 1488 / 1594 / 1714. Do not delete a receipt on a NET_DUE_ZERO bill.
