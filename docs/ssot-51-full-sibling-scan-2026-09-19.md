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

HEENA / ANANYA are the sibling-only shape (repaired row tender=0; other invoices drop at-sale). SHREEVASTAV is **both** shapes. A delete that only removes 1128/1129 / 1126 / 1145 still leaves POS search wrong.

---

## Three gates (not two)

| Gate | Meaning | 18-bill live lock (20:10 IST) | Mutate? |
| --- | --- | --- | --- |
| **SANTOSH_SEPARATE** | 1131-1 leftover-overpay on POS/1130. Not SNAP. Do not fold into A or B until that row is settled on its own. | POS/717 customer `1167547a…` | **No** |
| **NEEDS_BUCKET_G** | After excluding leftover-sum over-credit, SNAP still drops at-sale on the repaired bill **or** any sibling (`tender > 0` and remaining receipts `≥ tender`). | SHREEVASTAV, VIMLA, DIYA, HEENA (1488+1594+1714 = ₹9,686), ANANYA (1788 ₹2,416) | **No** until SNAP `paid_at_sale_drift` is fixed |
| **REPAIR_SUFFICIENT_SNAP** | No SNAP drop on the repaired bill after, and no sibling SNAP drop. Duplicate delete would not leave a bucket-(g) POS-search hole **on this defect**. Still not a green light: Velvet reprints, all-time paste, other families. | JATIN, RUCHI, SURESH, REKHA, NIKKI, SAYALI, DOLLY (no sibling SNAP in the 18-bill scan) | **No** until the full-51 paste confirms they stay here |
| **WALK_IN_NO_CUSTOMER** | Velvet POS/85. No C-JS/C-SNAP customer. | POS/85 | Held with Velvet reprints |

Repair membership in the paste is **leftover-sum** over-credit, not `GREATEST(receipts, tender)`:

```
over_credit_ledger = GREATEST(0, non-memo receipts + tender − (net − SRA))
repair bill if over_credit_ledger > 1
```

GREATEST is what first called VIMLA clean and SHREEVASTAV ₹2,100. Headline may not print exactly 51 / ₹2,99,467 — paste the CSV anyway; that count is the point of the scan.

---

## What the paste must return

1. **headline** row: bill count, sum of `over_credit_ledger`, counts per gate.
2. **bill** rows: every leftover-sum over-credit sale in GURUKRUPA / VELVET / ELLA NOOR / KS FOOTWEAR, with `gate`, `snap_drop_self`, `sibling_snap_drop`.
3. **sibling** rows: other invoices on those customers with SNAP drop (HEENA 1488 class).

Until that CSV is locked, **no bill in the 18 or the 51 is approved to mutate.** A repair that fixes the named duplicate but leaves POS search wrong on a sibling is not a completed customer fix.

**headline row column map** (UNION reuses bill names): `tender` = bill count, `paid_amount` = sum leftover-sum over-credit, `receipts_live` = NEEDS_BUCKET_G count, `over_credit_ledger` = REPAIR_SUFFICIENT_SNAP count, `over_credit_greatest` = SANTOSH_SEPARATE count, `receipts_after` = WALK_IN count.

---

## Split rule (locked)

```
if Santosh POS/717 or POS/1130 → SANTOSH_SEPARATE
else if no customer_id → WALK_IN_NO_CUSTOMER
else if snap_drop on repaired bill after OR sibling snap_drop > 0 → NEEDS_BUCKET_G
else → REPAIR_SUFFICIENT_SNAP
```

Do not put SHREEVASTAV / VIMLA / DIYA in REPAIR_SUFFICIENT_SNAP. Do not fold SANTOSH into either SNAP group.
