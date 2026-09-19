# Two-tier SSOT + 51-bill overlap — 19 Sep 2026

**This pass:** report only. **Do not mutate** the 51-bill set. Guard stays LIVE. Do not reverse RCP/1126, 1128, 1129, 1131-2, or Velvet 1131–1145.

The 9-way live harness in `.lovable/plan.md` Step 3 was **never executed** (roadmap: held; SQL editor has no JWT). This note substitutes **source formulas + named hand reconstructions** (SHREEVASTAV / VIMLA / SANTOSH / Velvet paste 4 / ELLA Farhaan · Sana · Aafra · MASEERA). That is enough to answer “wait vs repair now” and “select vs build” without a production write.

---

## Two tiers, not one target

| Tier | Question | Canonical today | Generalizes? |
| --- | --- | --- | --- |
| **1. Invoice-level** | What is owed on **this bill**? | `reconcileSaleInvoiceWithSplit` (leftover). Payment Receipt Select Invoices, Sales Invoice Dashboard, print this-bill Balance. SHREEVASTAV POS/1903 print **₹16,250**. | Yes, for that invoice. |
| **2. Customer / org-level** | What does this **customer** (or the org KPI) owe / hold? | **None of the 8 families is confirmed clean.** Leftover does **not** cascade upward. | Must be **built**: Σ leftover + opening + unclaimed CN/SR − unused advance − unallocated credit, plus an overpay policy. |

`SUM(open leftovers)` drops opening, unused advance, unclaimed CN/SR, unallocated receipts, and sibling overpays. C15 already sums a simpler leftover for aging then **overwrites the headline with C-SNAP**. Do not migrate C02 / C12 onto leftover.

Repairing duplicate receipts does **not** make C-JS or C-SNAP equal leftover. Locked projections on SHREEVASTAV after 1128/1129 gone: leftover **₹16,250**, C-JS **₹16,250 or ₹17,250**, C-SNAP **₹17,750**.

---

## Point 1 — 51-bill overlap with C-JS GREATEST / C-SNAP drift

The historical 51-bill plan assumed duplicate-receipt removal alone restores “correct balances.” That is true for **ledger columns** (sum of at-sale + receipts) on the repaired row. It is **false** for C-JS / C-SNAP **customer display** whenever the same account has mixed at-sale tender + later receipts.

### Detection (independent of the duplicate)

C-SNAP / C-PARTY / C-REC share:

```
paid_at_sale_drift = GREATEST(0, tender − sale_receipts)   -- does not read paid_amount
```

**SNAP drop** (bucket g, one leg): `tender > 0` AND remaining genuine receipts `≥ tender` → drift = 0 → at-sale cash never credited. Leftover still floors paid at tender (`max(tender, storedPaid − vouchers)`).

C-JS:

```
drift = max(0, max(paid_amount, tender) − voucherSum)   -- only when gap > 0
```

**GREATEST rewrite:** after the duplicate is gone, if `paid_amount ≤ remaining receipts` while tender is not a voucher, gap = 0 and C-JS also drops at-sale. If `paid_amount` still holds tender (SHREEVASTAV 875 live `paid_amount = 3100`), C-JS can land on leftover **on that bill** while SNAP does not.

The all-time 51 **roster is still not in this repo** (headline only: 51 / ₹2,99,467). The 29–30 May already-zero named set **is** locked live: SQL editor paste 19 Sep 2026 20:10 IST (`docs/ssot-51-bill-overlap-live-2026-09-19-20-10-57.csv`). First paste hit **42703** (`organizations.deleted_at`); retry used literal org ids.

### Live paste 20:10 IST — 18 unique bills (POS/875 listed twice = 1128 and 1129)

`snap_drop_after > 0` = SNAP still drops at-sale after the duplicate is excluded. Live `paid_amount` on 875/765/123 still holds tender, so **C-JS gap is positive** (the ₹17,250 GREATEST-rewrite path did **not** fire on these rows). SNAP still wrong.

| sale_number | Customer (id prefix) | tender | paid_amount | receipts_after | snap_drop_after | cjs_gap_after | Gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| POS/25-26/875 ×2 | SHREEVASTAV `3a4ef881` | 1,000 | **3,100** | 2,100 | **1,000** | **1,000** | **WAIT** SNAP (+ sibling 824 ₹500) |
| POS/26-27/765 | VIMLA `c085667a` | 400 | **3,000** | 2,600 | **400** | **400** | **WAIT** SNAP |
| POS/25-26/123 | DIYA `ff3547a1` | 1,000 | **11,000** | 10,000 | **1,000** | **1,000** | **WAIT** SNAP |
| POS/25-26/717 | SANTOSH `1167547a` | 75,200 | 81,200 | 6,000 | 0 (drift 69,200) | 75,200 | **WAIT** 1131-1 overpay (not SNAP) |
| POS/26-27/454 | DOLLY `bc266355` | 3,000 | 3,000 | 1,500 | 0 (drift 1,500) | 1,500 | No SNAP-drop sibling in this scan; still held with Velvet reprints |
| POS/26-27/853 | HEENA `dde74df8` | 0 | 2,770 | 2,770 | 0 | 0 | **WAIT customer** — siblings 1488 ₹6,290 + 1594 ₹2,547 + 1714 ₹849 = **₹9,686** SNAP-drop |
| POS/26-27/221, 536, 580, 70 | ANANYA `0616f278` | 0 | = receipts_after | = half of live | 0 | 0 | **WAIT customer** — sibling POS/1788 **₹2,416** SNAP-drop |
| POS/26-27/1116, 292 | RUCHI `71b043b8` | 0 | = receipts_after | | 0 | 0 | No SNAP-drop sibling in this scan |
| POS/26-27/378 | SURESH `c25acad2` | 0 | | | 0 | 0 | No SNAP-drop sibling in this scan |
| POS/26-27/416 | REKHA `1ad6cd52` | 0 | | | 0 | 0 | No SNAP-drop sibling in this scan |
| POS/26-27/558 | NIKKI `721fd1c2` | 0 | | | 0 | 0 | No SNAP-drop sibling in this scan |
| POS/26-27/610 | SAYALI `ae7d0c17` | 0 | | | 0 | 0 | No SNAP-drop sibling in this scan |
| POS/26-27/808 | JATIN `8538501f` | 0 | 13,699.90 | 13,700 | 0 | **−0.10** (rounding) | No SNAP-drop sibling in this scan |
| POS/26-27/85 | *(null customer_id)* | 0 | 15,862 | 15,862 | 0 | 0 | Walk-in — no C-JS/C-SNAP customer |

Sibling SNAP-drop rows in the same CSV (includes the repaired bill when it itself drops):

| sale_number | customer | snap_drop | Notes |
| --- | --- | ---: | --- |
| POS/25-26/875 | SHREEVASTAV | 1,000 | self |
| POS/26-27/824 | SHREEVASTAV | **500** | POS/824 class — live lock |
| POS/26-27/765 | VIMLA | 400 | self |
| POS/25-26/123 | DIYA | 1,000 | self |
| POS/26-27/1488 | HEENA | 6,290 | **new** — tender-0 repair bill 853 sits on this account |
| POS/26-27/1594 | HEENA | 2,547 | **new** |
| POS/26-27/1714 | HEENA | 849 | **new** |
| POS/26-27/1788 | ANANYA | 2,416 | **new** — her four tender-0 dups sit on this account |

**Answer to “any of the 51-set bills on SNAP/C-JS accounts?”** For this May already-zero named set: **yes.** HEENA and ANANYA look like safe tender-0 full-net dups on the repaired row and are **not** — sibling SNAP-drop is live. SHREEVASTAV / VIMLA / DIYA drop on the repaired bill itself. Live C-JS `paid_amount` still holds tender on those three, so glance *may* match leftover after delete; POS search will not.

This paste is **not** the all-time 51. Full leftover-sum + sibling SNAP-drop scan: `docs/ssot-51-full-sibling-scan-2026-09-19.md` / `scripts/ssot-51-full-sibling-scan-2026-09-19.sql`, pasted 21:09 IST. **SHREEVASTAV / VIMLA / DIYA / ANANYA are NEEDS_BUCKET_G** (14 customers / 25 bills in all). **HEENA is not**: 1488 / 1594 / 1714 are receipt-on-at-sale duplicates themselves (tender = receipt = net), so the ₹9,686 "sibling drop" disappears when all four of her bills are repaired together — she is REPAIR_SUFFICIENT_SNAP only as a 4-bill customer-atomic repair. SANTOSH stays separate. No mutate.

### Named bills — after duplicate gone, mutate not started

| Bill | Dup to reverse | Remaining genuine receipts | Tender | SNAP after repair | C-JS after repair | Gate |
| --- | --- | ---: | ---: | --- | --- | --- |
| SHREEVASTAV POS/875 | 1128+1129 | RCP/799 ₹2,100 | ₹1,000 | Drops ₹1,000 (`1000−2100→0`) **and** sibling POS/824 drops ₹500 → customer **₹17,750** | ₹16,250 if `paid_amount` still 3100; **₹17,250** if GREATEST rewrite to 2100 | **WAIT** both defects |
| VIMLA POS/765 | 1126 ₹400 | RCP/1125 ₹2,600 | ₹400 | Drops ₹400 (`400−2600→0`). Ledger/leftover → ₹0; SNAP still **₹400 Dr** | Likely ₹0 if `paid_amount` stays 3000 (gap 400) | **WAIT** SNAP |
| DIYA POS/123 | 1145 ₹10,000 | RCP/1 ₹10,000 | ₹1,000 | Drops ₹1,000 (`1000−10000→0`) | Same GREATEST fork as VIMLA | **WAIT** SNAP |
| DOLLY POS/454 | 1144 ₹1,500 | ₹1,500 | ₹3,000 | Drift `3000−1500=1500` — **captures** at-sale on **this** bill | OK on this bill if paid holds tender | **WAIT customer** (siblings not reprinted) |
| SANTOSH POS/717 | 1131-2 ₹6,000 | RCP/213 ₹6,000 | ₹75,200 | Drift `75200−6000=69200` — captures at-sale on **this** bill | OK on this bill if paid holds 81200 | **WAIT customer**: 1131-1 overpay on POS/1130 is a **different** leftover-overpay; CN recon split |
| Velvet 13× tender **0** (JATIN, HEENA, RUCHI×2, ANANYA×4, SAYALI, REKHA, SURESH, NIKKI, walk-in 85) | full-net dup | prior = net | 0 | SNAP skip (`tender ≤ 0.005`) on **this** bill | Bill-level can match leftover | **WAIT customer** until sibling SNAP-drop scan; walk-in 85 has **no** C-JS/C-SNAP customer |
| SANTOSH POS/1130 RCP/1131-1 | **not in 51** | — | 0 | n/a | n/a | Keep out. `remaining_before` ₹300 ≠ 0 |

**None of the named Gurukrupa rows is safe to repair now** if the success test includes C-JS / C-SNAP / POS search Due. Ledger-only success would still leave VIMLA/SHREEVASTAV/DIYA **wrong on POS search**.

**Do not start the 51-bill mutate.** Split later:

1. **WAIT SNAP formula** — repaired bill itself drops: SHREEVASTAV 875, VIMLA 765, DIYA 123. Live `paid_amount` holds tender (C-JS gap 1000 / 400 / 1000) so glance *may* match leftover; POS search will not. SHREEVASTAV also sibling 824 ₹500.
2. **WAIT sibling SNAP** — ANANYA (four tender-0 dups; sibling 1788 ₹2,416, `over_credit = 0`, nothing to delete). HEENA was here at 20:10 IST; the 21:09 full scan shows 1488+1594+1714 (₹9,686) are duplicates in their own right and she moves to customer-atomic B — repair 853 alone and the ₹9,686 stays.
3. **WAIT other** — SANTOSH 1131-1 leftover-overpay (not SNAP). Velvet five-invoice reprint still required.
4. **Walk-in POS/85** — no customer ledger; still held with that reprint gate.
5. All-time 51 still unscanned.

---

## Point 2 — customer/org-level families vs ground truth (not vs each other)

Question: which family correctly aggregates **opening + unused advance + unclaimed CN/SR + all receipts** at customer level against a **hand-reconstructed** truth?

| Family | What it actually does | Independent defect vs leftover-composed truth | Named ELLA / Gurukrupa result |
| --- | --- | --- | --- |
| **C-PARTY** | Set-based signed. **Nets unused advance.** `paid_at_sale_drift` = SNAP formula (`GREATEST(0, tender−receipts)`, no `paid_amount`). | **Same SNAP drop as C-SNAP.** Unused-advance sign is a facet split vs C-JS outstanding. | ELLA overlap signed-equals C-SNAP — that is **shared bug**, not two proofs. Sana −₹20,000 is unused-advance **netPosition**, not leftover-sum. Farhaan −₹100 is CN leftover **without** mixed at-sale. |
| **C-SNAP** | Same drift as C-PARTY. POS search `grossOutstandingDr`. | Bucket (g). SHREEVASTAV live ₹14,650; after 1128/1129 **₹17,750**. | Not clean. |
| **C-REC / C-TRUE** | `reconcile_customer_balance` components. Latest body (`20261219120000`) uses the **same** `GREATEST(0, tender−receipts)` drift. C-TRUE is a wrapper; **zero UI callers**. | **Same SNAP drop.** Unverified vs Farhaan live. C14/C26/C46 already a different family from dashboard C12. | Not clean. Not selected. |
| **C-STMT** | `get_customer_ledger_statement` — **SQL not in this repo** + client merge on `/customer-account-statement`. | Independent running balance. Never locked vs Farhaan / SHREEVASTAV. | **Unverified.** Cannot be selected. |
| **C-AUDIT** | `customerAuditMath.computeCustomerOutstanding` **delegates to C-JS core**. | **Same GREATEST gap** as C-JS. Farhaan −₹100 lock is the CN-memo fixture, not mixed at-sale. | Not clean for SHREEVASTAV-class accounts. |
| **C-OB-SALES** | `opening + invoiced − paid_amount` (or salesman fallback opening + invoice leftover). | **Known wrong** for CN / advance / SRA. Farhaan naive **₹2,700** vs truth **−₹100**. | Rejected. |
| **C-JS** | Outstanding does **not** net unused advance. Drift uses `max(paid, tender)`. | GREATEST absorb. SHREEVASTAV glance **₹14,150**. Demoted. | Not the customer SSOT. |
| **C-RECON-LEDGER** | Sum of rendered ledger rows (at-sale **plus** every receipt). | Follows duplicates rupee-for-rupee (SHREEVASTAV ₹13,150). After dups gone, matches leftover **on SHREEVASTAV because other legs are ₹0**. Does not scale to 7,772 KPI cards. Not a drop-in for unused advance / unclaimed CN (SANTOSH header vs recon already disagree by CN memo). | Ledger truth for cash columns; **not** org KPI. |

Sana Nasir “C-JS = C-PARTY” is **facet agreement** (`netPosition` vs signed that already nets unused). It is not evidence that either family is the leftover-composed customer total.

Farhaan −₹100 locks C-JS / C-PARTY / C-AUDIT / C-RECON on a **CN leftover** fixture with no at-sale+receipt mix. It does **not** clear bucket (g) or GREATEST.

---

## Point 3 — none is clean; customer SSOT must be built

**None of C-PARTY, C-REC/C-TRUE, C-STMT, C-AUDIT, or C-OB-SALES is a confirmed customer/org-level canonical source.**

Selecting C-PARTY because it matches C-SNAP on ELLA overlap would **install bucket (g) into KPI cards**. Selecting C-JS would install GREATEST. Selecting leftover-sum would drop opening / advance / CN pool.

**Build** a set-based customer row:

```
canonical_signed =
    Σ invoice leftover
  + opening
  + unclaimed CN/SR remaining
  − unused advance          -- or keep as a facet, not mixed into Dr
  − unallocated customer credit
  ± explicit overpay policy (SANTOSH 1131-1 class)
```

Invoice leftover stays the **tier-1** writer for payment/print. KPI / Customer Balances read the **tier-2** builder. That is larger scope than “pick one of the eight.”

---

## Repair gate (updated)

1. Do **not** start the 51-bill mutate.
2. SHREEVASTAV / VIMLA / DIYA are **WAIT** even for a ledger-correct delete, if POS search / glance must match leftover afterward.
3. Velvet tender=0 rows still need a **sibling SNAP-drop scan** plus the five-invoice reprint already required.
4. C-JS GREATEST writer and C-SNAP `paid_at_sale_drift` are **separate** fixes from duplicate soft-delete.
5. Customer/org SSOT is a **new function**, not a family rename.
