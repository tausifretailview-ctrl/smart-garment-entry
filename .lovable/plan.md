# Purchase supplier invoice serial 5 vs dashboard showing 3 — PAYAL SHOES

## What the data shows (verified, read-only)

PAYAL SHOES has **5 purchase bills**, none deleted, none cancelled:

| Software Bill No | Supplier | Supplier Inv No | Auto-generated | Bill date | Net |
|---|---|---|---|---|---|
| PUR/26-27/1 | BHOOMI | 1 | yes | 14 Aug 2026 | 5,072 |
| PUR/26-27/2 | OPENNING STOCK | 2 | yes | 14 Aug 2026 | 1 |
| PUR/26-27/3 | BHOOMI SALES CORP | 0108 | no (typed) | 10 Aug 2026 | 15,441 |
| PUR/26-27/4 | MAQBOOL ZUBAIR | 3 | no (typed) | 06 Aug 2026 | 24,200 |
| PUR/26-27/5 | MAQBOOL ZUBAIR | 4 | yes | **16 Jun 2026** | 6,930 |

There are **no drafts** for this organization, and no gap in the software bill series (1..5 all present).

## Why the two screens disagree

- The Purchase Bills dashboard was on the **"This Month" filter**, and PUR/26-27/5 carries a **bill date of 16 Jun 2026** (entered 15 Aug). So the dashboard shows only 4 bills, the highest visible supplier invoice being 3.
- Purchase Entry's "next serial" counter is **date-independent** — it looks at the highest auto-generated numeric supplier invoice across the whole organization. That is 4 (on PUR/26-27/5), so it correctly suggests 5.

So nothing is missing and no serial was skipped. It is a visibility difference caused by the June bill date plus the month filter.

## What is worth fixing

1. Confirm with the user whether PUR/26-27/5's bill date of 16 Jun 2026 is intentional (backdated supplier bill) or a typo for August. If it is a typo, correct that one bill's date so it appears in the current month view. No other data change.
2. Optional UI clarity: on Purchase Entry, change the hint under Supplier Invoice No from "Previous bill used 4 · next serial 5" to also name the bill it came from (e.g. "Previous auto serial 4 on PUR/26-27/5 · next 5") so a hidden/backdated bill is never mistaken for a skipped serial.

## Technical notes

- Counter source: `peek_next_supplier_invoice_number` / `resolveNextSupplierInvoiceNumber` in `src/utils/purchaseSupplierInvoiceNumber.ts` — uses max of `supplier_invoice_no` where `supplier_inv_auto_generated = true`, org-wide, no date filter. This is correct behaviour and should not change.
- Dashboard filter lives in the Purchase Bills page and filters on `bill_date`, not `created_at`.
- Item 2 is a label-only change in the Purchase Entry header; item 1 is a single-row data correction pending user confirmation.
