# 51-bill repair set — SHREEVASTAV correction (no mutate)

**Date:** 19 Sep 2026  
**This pass:** correct one named row before historical repair proceeds. **Do not soft-delete anything.**

> **Retired 19 Sep 23:00 IST — the "51 bills / ₹2,99,467" headline below is history, not a
> target.** Step 1 (`docs/ssot-step1-51-vs-91-reconciliation-2026-09-19.md`) replays the old rule
> to exactly 51 bills at ₹1,63,086; no rule reproduces ₹2,99,467. Current populations live in
> `docs/ssot-three-pastes-review-2026-09-19-22-24.md` (85 bills / ₹2,80,818; Tier 1 = 11 rows /
> ₹62,916 approved, not yet executed — `docs/ssot-tier1-hand-checks-2026-09-19.md`).

Headline on `main` after the CN-vs-SRA resize: **51 bills / ₹2,98,467**.  
SHREEVASTAV (GURUKRUPA `e8fbf0d8…`, POS/25-26/875) was in that set at **₹2,100**.  
Correct entry: **₹3,100**. New headline: **51 bills / ₹2,99,467**.

Hand-check after her repair: live ledger must land on **₹16,250 Dr**, matching her printed POS/26-27/1903 Outstanding / Total Due.

---

## Why the later audit pass said ₹2,100-only

POS/25-26/875 has four real cash legs. Only three of them are `voucher_entries` rows.

| When | What | Amount | In `voucher_entries`? |
| --- | --- | ---: | --- |
| 02/03 11:59 | at-sale cash (`sales.cash_amount`) | ₹1,000 | **No** |
| 05/03 11:44 | RCP/25-26/799 | ₹2,100 | Yes |
| 30/05 12:59 | RCP/26-27/1128 | ₹2,100 | Yes |
| 30/05 12:59 | RCP/26-27/1129 | ₹1,000 | Yes |

The 51-bill resize used the settlement helper’s paid rule:

`LEAST(net, GREATEST(receipt_vouchers, at_sale_tender))`

`compute_sale_settlement` / `GREATEST(receipt_total, tender)` is **max, not sum**. Once any receipt exists, the ₹1,000 counter tender is discarded (`saleSettlement.ts` `ensureAtSaleTenderReceipt` comment: ELLA NOOR POS/26-27/93 class).

On that formula:

- voucher sum = 2,100 + 2,100 + 1,000 = **₹5,200**
- `GREATEST(5,200, 1,000) = 5,200`
- over-credit vs net ₹3,100 = **₹2,100**
- leftover after RCP/799 looks like ₹1,000 still owed, so **1129 looks like the genuine leftover** and only 1128 looks duplicate

That is the same sentence as the first 18 Sep draft: “₹1,000 of that was genuinely owed; real over-credit ₹2,100.” It is a **measurement artefact**, not a second look at the ledger.

The customer ledger and the printed bill **add** at-sale + receipts. They do not take `GREATEST`.

---

## PDF lock (19 Sep 2026 00:01, `SHREEVASTAV_Ledger_19-09-2026_a29d.pdf`)

| Time IST | Ref | Debit | Credit | Running |
| --- | --- | ---: | ---: | --- |
| 02/03 11:59 | POS/875 | 3,100 | 1,000 at-sale | 2,100 Dr |
| 05/03 11:44 | RCP/799 | | 2,100 | **0** |
| 25/05 | POS/766 | 4,900 | 4,900 at-sale | 0 |
| 25/05 | POS/767 | 5,600 | | 5,600 Dr |
| 30/05 12:44 | RCP/1127 | | 5,600 | 0 |
| 30/05 **12:59** | **RCP/1128** | | **2,100** | 2,100 Cr |
| 30/05 **12:59** | **RCP/1129** | | **1,000** | **3,100 Cr** |
| 30/05 13:05 | POS/824 | 3,500 | 500 at-sale | 100 Cr |
| 04/06 | RCP/1391 | | 3,000 | 3,100 Cr |
| 18/09 13:17 | POS/1903 | 17,250 | 1,000 at-sale | **13,150 Dr** |

`remaining_before` (script 3: net − SRA − prior receipts − residual tender):

- **1128:** 3,100 − 2,100 (799) − 1,000 tender = **₹0**
- **1129:** 3,100 − 4,200 (799+1128) − 1,000 tender = **₹0**

Both land on an already-zero bill. Over-credit = 2,100 + 1,000 = **₹3,100**.

Live column / recon Outstanding **₹13,150 Dr**.  
13,150 + 3,100 = **₹16,250**. That is the photographed print footer (previousBalance 0 + this-bill leftover ₹16,250).

Repairing **only 1128** would land on ₹15,250 — ₹1,000 short of the printed invoice. That is why ₹2,100 must not proceed.

The PDF header `Customer owes ₹14,150` (₹1,000 above the columns) is the same GREATEST hole: canonical leftover drops 1129 once 875 is treated as already receipt-capped. It is not a ninth formula and it is not the repair target.

---

## Corrected repair-set row

| Org | Customer | Bill | Vouchers to reverse | Over-credit | Post-repair hand-check |
| --- | --- | --- | --- | ---: | ---: |
| GURUKRUPA `e8fbf0d8` | SHREEVASTAV 9819151882 | POS/25-26/875 | **RCP/26-27/1128 ₹2,100 and RCP/26-27/1129 ₹1,000** | **₹3,100** | Ledger Outstanding **₹16,250 Dr** |

Do **not** reverse RCP/799 or the at-sale ₹1,000. Do **not** touch RCP/1127 (POS/767).

Population headline after this one-row fix: **51 bills / ₹2,99,467** (= 2,98,467 + 1,000). Still 51 bills.

This pass does **not** re-measure the other 50. The same `GREATEST` hole can understate any bill whose at-sale cash was never materialised as a voucher (VIMLA 1126 / SANTOSH 1131-2 class). Those stay out of this correction unless a later named reprint asks.

---

## Repair gate

Do **not** start the historical mutate.

Live overlap paste 19 Sep 2026 20:10 IST (`docs/ssot-51-bill-overlap-live-2026-09-19-20-10-57.csv`) — May already-zero named set:

- SHREEVASTAV / VIMLA / DIYA: SNAP still drops at-sale on the repaired bill (`paid_amount` still holds tender, so C-JS gap is 1000 / 400 / 1000 — glance *may* match leftover; POS search will not). SHREEVASTAV sibling POS/824 ₹500 live.
- HEENA POS/853 and ANANYA’s four tender-0 dups sit on **sibling** SNAP-drop (₹9,686 and ₹2,416). They are not safe tender-0 repairs.
- SANTOSH 1131-1 leftover-overpay is a different defect. **SANTOSH_SEPARATE** — do not fold into SNAP groups.
- Full leftover-sum + sibling scan pasted 21:09 IST (`docs/ssot-51-full-sibling-scan-live-2026-09-19-21-09-22.csv`, 456 rows). Receipt-bearing population is **91 bills / ₹2,98,108.51** (₹ matches this headline within ₹1,358; the count does not — the 51 was never materialised by `sale_number`). Split, customer-level: **A NEEDS_BUCKET_G 14 customers / 25 bills** (SHREEVASTAV, VIMLA, DIYA, ANANYA + 10) — **B REPAIR_SUFFICIENT_SNAP 52 / 62** (49 / 57 after 5 NET_DUE_ZERO refund rows and DOLLY leave) — SANTOSH 2 — walk-in 2. **HEENA moved to B**: her 1488/1594/1714 "siblings" are receipt-on-at-sale duplicates themselves; B is customer-atomic (all 4 or none). 365 further tender-only rows (at-sale cash > net, no receipt) are a separate population. **Still no mutate** — see `docs/ssot-51-full-sibling-scan-2026-09-19.md`.

Two-tier SSOT: leftover is invoice-level only. Customer/org canonical source must be **built**, not picked from C-PARTY/C-REC/C-STMT/C-AUDIT/C-OB-SALES. See `docs/ssot-two-tier-51-bill-overlap-2026-09-19.md`. Still no money-row write in this commit.
