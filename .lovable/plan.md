## What I verified

Compared the uploaded `KIDZSTOCK_Item_Name.xlsx` (master file, split into 7 import parts) against the live **KIDS ZONE** organization in the database.

### Top-line counts
| Source | Rows / Variants |
|---|---|
| Excel file (unique barcodes) | 24,086 (24,114 rows incl. 28 dupes) |
| DB variants in KIDS ZONE | 35,348 (35,156 distinct barcodes) |
| Barcodes in BOTH | 20,242 |
| Excel barcodes **missing** in DB | **3,844** |
| DB barcodes with >1 variant (duplicates) | 192 |

### Field-level mismatches on the 20,242 matched barcodes
| Field | Mismatched rows |
|---|---|
| **MRP** | **20,433** (DB column is empty on ~99.85% of variants) |
| sale_price | 8,379 |
| pur_price | 8,233 |
| size | 7,865 |
| product_name | 6,746 |
| color | 3,542 |
| brand | 3,416 |

In the whole org, only **51 of 35,348 variants have any MRP** — confirming MRP was never written by the import.

### "Which part is bad" — the previously-reported file
Looking at mismatches bucketed by barcode range, the bad batch is clearly **Part 1 — barcodes 000000001–000004999**:

| Bucket | Excel rows | Imported | Missing | MRP empty |
|---|---|---|---|---|
| **000000–004999** | **3,865** | **380** | **3,485** | 380 |
| 005000–009999 | 4,279 | 4,278 | 1 | 4,277 |
| 010000–014999 | 3,152 | 3,151 | 1 | 3,151 |
| 200M series | 747 | 747 | 0 | 747 |
| (all other ranges) | small misses (1–56 each) | — | — | — |

So Part 1 is ~90% missing, and on top of that the import pipeline never mapped the **MRP** column for any part. The other parts also show secondary column-shift issues (size/name/price misalignment) in the 015000–129999 range — visible as sample rows like:

```
000130653  Excel SHIRT/XS/MRP 675/Sale 530  →  DB T.SHIRT/S/MRP -/Sale 290
000039241  Excel TRACK PANT/38/MRP 324      →  DB KARACHI SUITE/XXL/MRP -/Sale 1450
000096140  Excel JEANS/S/TOKYO/MRP 1065     →  DB JINS/XS/KIDS ZONE/MRP -/Sale 850
```

These look like prior re-imports that overwrote some rows with wrong column mapping.

## Proposed plan (in 3 small, safe steps)

### Step 1 — Generate full audit report (no DB writes)
Build a CSV/Excel report at `/mnt/documents/kidzstock_audit.xlsx` with sheets:
1. `missing_in_db` — 3,844 barcodes present in Excel but absent in DB (this is mostly Part 1).
2. `mrp_blank` — every matched barcode whose DB MRP is empty (≈ 20,433 rows) with the correct MRP from Excel.
3. `field_mismatch` — matched barcodes where size / color / product_name / brand / sale_price / pur_price disagree (with both sides shown).
4. `duplicate_barcodes_in_db` — the 192 barcodes with >1 active variant in KIDS ZONE.
5. `duplicates_in_excel` — the 28 duplicate rows inside the source file.

You review this report and confirm which corrections to apply before any write.

### Step 2 — Backfill MRP only (lowest risk)
After your approval, write a single migration that:
- Updates `product_variants.mrp` for KIDS ZONE rows where `mrp IS NULL OR mrp = 0`, using the MRP from the Excel master matched by `barcode`.
- Scoped strictly by `organization_id = 'a1bac661-…' AND deleted_at IS NULL`.
- No touch to `sale_price`, `pur_price`, `stock_qty`, names, sizes, or any other column.
- Dry-run count printed in the migration comment.

### Step 3 — Re-import the missing Part 1 batch
For the 3,844 missing barcodes (mostly the 000000001–000004999 range):
- Produce a clean import-ready Excel using exactly the master file's column mapping, so you can run it through the existing Inventory → Import flow yourself.
- I will not bulk-insert products directly; using the existing import UI ensures triggers, sequences, batch_stock, GST, and audit logs all behave correctly.

### Step 4 (optional, only after Steps 1–3) — Fix the size/name/price drift
For the rows in `field_mismatch` (sale_price / pur_price / size / name / brand / color), I will:
- Show you the top patterns (e.g. "all rows where DB size is one position off from Excel" indicating a specific bad part).
- Wait for explicit row-by-row or batch approval before any UPDATE — these were created by real prior imports and may include intentional edits, so blind overwrite would be wrong.

## Safety / scope (what I will NOT do)
- No change to UI, printing, QZ Tray, settings, RPCs, edge functions, sale/POS/billing logic.
- No hard deletes. No touch to other organizations.
- No mutation of `stock_qty`, `current_stock`, sales, or any transactional table.
- Every UPDATE will be scoped by `organization_id` and `barcode`, in a new timestamped migration.

## What I need from you to proceed
1. Confirm Step 1 (generate audit report) — I'll deliver the file in the next turn.
2. After you review it, tell me whether to proceed with Step 2 (MRP backfill) and Step 3 (re-import Part 1 prep).
