# SHREEVASTAV (GURUKRUPA) — 30-May duplicate POS receipts

**Date:** 19 Sep 2026  
**Org:** GURUKRUPA SILK SAREES (`e8fbf0d8-182c-4364-8570-96c756b72db8`)  
**Customer:** SHREEVASTAV, phone 9819151882  
**Evidence:** `SHREEVASTAV_Ledger_19-09-2026_dc1e.pdf` generated 19 Sep 2026 00:01; POS A5 tax invoice POS/26-27/1903 photographed from POS Dashboard reprint; SQL-editor pastes 19 Sep 2026 00:22–00:28 IST (`…00-22-48_2474`, `…00-23-33_612c`, `…00-23-50_8008`, paste 3 `…00-28-21_f03b`).  
**This pass:** facts and scope only. **No repair. Do not soft-delete RCP/1128 or RCP/1129.**

---

## 1. RCP/1128 and RCP/1129 — live paste 1 (confirmed)

Same sale row `57331371-b3f5-4009-a3c1-b5836513f01a` = **POS/25-26/875**, `reference_type = sale`, `deleted_at` null, `payment_status = completed`, `paid_amount = 3100`, at-sale cash ₹1,000.

| Voucher | created_at UTC | created_at IST | Amount | Description (full) |
| --- | --- | --- | ---: | --- |
| RCP/26-27/1128 | 2026-05-30 **07:29:06.757Z** | 12:59:06 | ₹2,100 | `Payment for POS/25-26/875` |
| RCP/26-27/1129 | 2026-05-30 **07:29:20.724Z** | 12:59:20 | ₹1,000 | `Payment for POS/25-26/875` |

Both `voucher_date = 2026-05-30`, `payment_method = cash`. 14 seconds apart. Exact Customer Payment Tab template (`Payment for ${sale_number}`), **not** POS Dashboard (`Payment received for POS sale…`). Two whole RCP numbers = two `generate_voucher_number` calls.

POS/875 was already fully settled on 05/03 (at-sale ₹1,000 + RCP/799 ₹2,100). These two rows replay those legs. Live ledger ₹13,150; minus them ₹16,250, matching the printed bill.

---

## 2. Headline (paste 5) — two orgs only

| Org | Rows | Customers | Invoices | Amount |
| --- | ---: | ---: | ---: | ---: |
| VELVET EXCLUSIVE LADIES WEAR & BAGS `dafc3d0c` | **15** | 10 | 15 | **₹70,842** |
| Gurukrupa Silk Sarees `e8fbf0d8` | **4** | 3 | 3 | **₹9,500** |

No other org hit this already-zero-balance POS-template filter on 29–30 May.

Paste 3 names all four Gurukrupa rows (₹400 + ₹2,100 + ₹1,000 + ₹6,000 = ₹9,500). RCP/1127 is **not** in the set (correct: POS/767 still had ₹5,600 remaining).

| Customer | Voucher | UTC | Invoice | Net | Prior | Tender | Dup amt | What it duplicates |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| VIMLA YADAV 9869426163 | RCP/26-27/1126 | 29 May **16:18:41Z** (21:48 IST) | POS/26-27/765 | 3,000 | 2,600 | 400 | **400** | at-sale tender |
| SHREEVASTAV | RCP/26-27/1128 | 30 May 07:29:06Z | POS/25-26/875 | 3,100 | 2,100 | 1,000 | **2,100** | RCP/799 |
| SHREEVASTAV | RCP/26-27/1129 | 30 May 07:29:20Z | POS/25-26/875 | 3,100 | 4,200 | 1,000 | **1,000** | at-sale; prior already includes 1128 |
| SANTOSH ZADE 9324531447 | RCP/26-27/**1131-2** | 30 May **07:39:31Z** (13:09 IST) | POS/25-26/717 | 81,200 | 6,000 | 75,200 | **6,000** | prior ₹6,000 receipt |

VIMLA and SANTOSH are the DOLLY/DIYA shape: `prior + tender = net` before the new row. SANTOSH’s `1131-2` suffix is a multi-invoice Customer Payment Tab save (`${base}-${i+1}`). Sibling **1131-1 is not in this list** — it was not already-zero and must not be treated as a duplicate from the suffix alone. 07:39:31Z is the end of the cited 07:29–07:39 UTC window.

---

## 3. VELVET paste 4 — same shape, different template and clock

All 15 rows: `remaining_before = 0`, `reference_type = sale`, description `Payment received for POS sale POS/… - ` (POS Dashboard Record Payment). Sequential RCP/1131–1145 from **11:34:31 to 11:41:47 UTC** (17:04–17:11 IST) — about 15–20 seconds apart. That is a burst, four hours after Gurukrupa’s 07:29 UTC pair.

| Customer | Invoice | Net | Prior receipts | Tender | Dup RCP | Dup amt |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| JATIN BHAI KENYA | POS/26-27/808 | 13,699.90 | 13,700 | 0 | 1131 | 13,700 |
| HEENA PATEL | POS/26-27/853 | 2,770 | 2,770 | 0 | 1132 | 2,770 |
| RUCHI | POS/26-27/1116 | 5,570 | 5,570 | 0 | 1133 | 5,570 |
| ANANYA TRIPATHI | POS/26-27/580 | 3,900 | 3,900 | 0 | 1134 | 3,900 |
| SAYALI MADAM | POS/26-27/610 | 2,299 | 2,299 | 0 | 1135 | 2,299 |
| ANANYA TRIPATHI | POS/26-27/536 | 3,149 | 3,149 | 0 | 1136 | 3,149 |
| REKHA SANCHETI | POS/26-27/416 | 2,000 | 2,000 | 0 | 1137 | 2,000 |
| ANANYA TRIPATHI | POS/26-27/70 | 1,500 | 1,500 | 0 | 1138 | 1,500 |
| *(null customer_id)* | POS/26-27/85 | 15,862 | 15,862 | 0 | 1139 | 15,862 |
| ANANYA TRIPATHI | POS/26-27/221 | 2,745 | 2,745 | 0 | 1140 | 2,745 |
| RUCHI | POS/26-27/292 | 570 | 570 | 0 | 1141 | 570 |
| SURESH | POS/26-27/378 | 1,977 | 1,977 | 0 | 1142 | 1,977 |
| NIKKI PATEL | POS/26-27/558 | 3,300 | 3,300 | 0 | 1143 | 3,300 |
| DOLLY JAIN | POS/26-27/454 | 4,500 | 1,500 | 3,000 | 1144 | 1,500 |
| DIYA | POS/25-26/123 | 11,000 | 10,000 | 1,000 | 1145 | 10,000 |

Thirteen rows duplicate the **full net** (tender 0, prior receipts already = net). DOLLY / DIYA duplicate the **prior receipt slice** while at-sale tender already covers the rest (`prior + tender = net`). ANANYA has four invoices; RUCHI two. POS/85 has no customer name (`COUNT(DISTINCT customer_id)` skips null → 10).

This is SQL remaining_before reconstruction per invoice, not a full customer-ledger reprint like SHREEVASTAV. Same duplicate shape. Still no mutate.

---

## 4. Two clusters on 30 May, not one

| Cluster | Org | UTC | Template | Writer |
| --- | --- | --- | --- | --- |
| 29 May 16:18:41 | Gurukrupa VIMLA | 21:48 IST | `Payment for POS/26-27/765` | Customer Payment Tab |
| 30 May 07:29:06–07:39:31 | Gurukrupa SHREEVASTAV + SANTOSH | 12:59–13:09 IST | `Payment for POS/…` | Customer Payment Tab (SANTOSH is `1131-2`) |
| 30 May 11:34:31–11:41:47 | Velvet 15 invoices | 17:04–17:11 IST | `Payment received for POS sale POS/… - ` | POS Dashboard Record Payment |

Same “receipt against remaining 0” shape. Gurukrupa 07:29–07:39 UTC is Customer Payment Tab (including SANTOSH at 07:39:31). Velvet is a later POS Dashboard burst. VIMLA is the previous evening, same Tab template.

---

## 5. Print footer — not a 9th outstanding formula

Photographed POS/26-27/1903 (POS Dashboard reprint, A5 Gurukrupa):

| Line | Printed | Source |
| --- | ---: | --- |
| Bill Total | ₹17,250 | invoice net |
| Received | ₹1,000 | at-sale cash / `paidAmount` |
| **Balance** | **₹16,250** | `invoiceThisBillBalance` — this invoice only |
| Outstanding | ₹16,250 | `gurukrupaInvoiceAccountLines` = previousBalance + this-bill Balance |
| Advance | ₹0 | unused advance from `fetchInvoicePrintAccountFacets` |
| Total Due | ₹16,250 | Outstanding − Advance |

`previousBalance` is canonical `getCustomerAccountState.outstanding` minus this bill on reprint. Printed Outstanding ₹16,250 means previousBalance used was **0**, which is the true prior once 1128/1129 are out. A signed fetch of live ₹13,150 would print ₹13,150.

---

## 6. Still needed before any repair

Gurukrupa paste 3 is complete (VIMLA / SHREEVASTAV / SANTOSH). Before any mutate:

- Ledger reprint for VIMLA POS/765 and SANTOSH POS/717 (same standard as SHREEVASTAV PDF).
- Do not touch sibling **RCP/26-27/1131-1** unless it independently has remaining_before 0.
- At least five Velvet source invoices (DOLLY/DIYA, ANANYA, POS/85).
- Do **not** soft-delete 1126 / 1128 / 1129 / 1131-2 or Velvet 1131–1145 until that hand-check.

Paste files remain: `scripts/shreevastav-dup-*.sql`.
