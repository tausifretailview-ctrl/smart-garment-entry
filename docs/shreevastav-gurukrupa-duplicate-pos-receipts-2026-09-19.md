# SHREEVASTAV (GURUKRUPA) — 30-May duplicate POS receipts

**Date:** 19 Sep 2026  
**Org:** GURUKRUPA SILK SAREES (`e8fbf0d8-182c-4364-8570-96c756b72db8`)  
**Customer:** SHREEVASTAV, phone 9819151882  
**Evidence:** `SHREEVASTAV_Ledger_19-09-2026_dc1e.pdf` generated 19 Sep 2026 00:01; POS A5 tax invoice POS/26-27/1903 photographed from POS Dashboard reprint.  
**This pass:** facts and scope SQL only. **No repair. Do not soft-delete RCP/1128 or RCP/1129.**

Production tenant tables are RLS-blocked from this environment (anon `42501`). Exact `created_at` / `reference_id` still need the SQL-editor pastes below. Reconstruction uses the live ledger PDF + the print helpers that emit the photographed footer.

---

## 1. Confirmed on SHREEVASTAV (hand ledger)

POS/25-26/875 ₹3,100 on 02/03/26 was fully settled on 05/03/26:

| When | What | Amount |
| --- | --- | ---: |
| 02/03 11:59 | Payment at sale (cash) | ₹1,000 |
| 05/03 11:44 | RCP/25-26/799 | ₹2,100 |
| | | **₹3,100** |

Then on 30/05/26 12:59 PM IST the ledger shows two more receipts against the same POS/25… series:

| Voucher | Amount | PDF description (truncated) |
| --- | ---: | --- |
| RCP/26-27/1128 | ₹2,100 | `Payment for POS/25...` |
| RCP/26-27/1129 | ₹1,000 | `Payment for POS/25...` |

Those amounts are the original two settlement legs replayed. Removing them from the running balance lands on **₹16,250**, matching the printed bill. Leaving them in lands on the live ledger **₹13,150**. Gap = ₹3,100.

Ledger payment **time** is `voucher_entries.created_at` (`customerLedgerTransactions.ts` maps `timestamp: voucher.created_at`; PDF formats `hh:mm a`). 12:59 PM IST = **07:29 UTC on 30 May 2026** — the start of the previously cited 07:29–07:39 UTC cluster. Milliseconds still need paste 1.

PDF text **`Payment for POS/25...`** matches Customer Payment Tab (`Payment for ${sale_number}`), not POS Dashboard Record Payment (`Payment received for POS sale ${sale_number}`). Two separate voucher numbers (1128, 1129) rather than `1128-1` / `1128-2` means two `generate_voucher_number` calls — two saves, not one multi-invoice split.

Not every 30-May Gurukrupa POS-template receipt is this signature. **RCP/26-27/1127 ₹5,600** at 12:44 PM IST settles POS/26-27/767 which had **no** at-sale payment on the ledger — remaining was ₹5,600. That is a genuine later collection, 15 minutes before the duplicates.

Same-day residual on POS/26-27/824 (₹3,500 − ₹500 at-sale) is closed later by RCP/26-27/1391 on 04/06, outside this window.

---

## 2. Why this could have been recorded at all

Same calendar day (30 May 2026) the app was shipping dashboard “Not Paid after customer payment / at-sale tender” fixes (PRs #16–#23). Customer Payment Tab then (and until `assertCustomerPaymentWithinOutstandingCap` landed) could write a receipt against an invoice whose **on-screen** leftover was stale `paid_amount` while at-sale cash + an older RCP had already cleared it.

Today that overpay is blocked. That does **not** prove 1128/1129 were a script vs two cashier saves. Arithmetic is duplicate; writer still needs paste 1 (`created_by`, `reference_type`, full description).

---

## 3. Print footer — not a 9th outstanding formula

Photographed POS/26-27/1903 (POS Dashboard reprint, A5 Gurukrupa):

| Line | Printed | Source |
| --- | ---: | --- |
| Bill Total | ₹17,250 | invoice net |
| Received | ₹1,000 | at-sale cash / `paidAmount` |
| **Balance** | **₹16,250** | `invoiceThisBillBalance(billTotal, receivedToday)` — **this invoice only** |
| Outstanding | ₹16,250 | `gurukrupaInvoiceAccountLines` = previousBalance + this-bill Balance |
| Advance | ₹0 | unused advance from `fetchInvoicePrintAccountFacets` |
| Total Due | ₹16,250 | Outstanding − Advance |

`previousBalance` comes from `fetchInvoicePrintAccountFacets` → `getCustomerAccountState.outstanding` (canonical receipt-sum, same family as the ledger), minus this bill when `accountIncludesThisBill: true` (POS save and POS Dashboard reprint).

That is **not** a separate outstanding formula. Balance is always this-bill leftover. Outstanding is canonical prior + this-bill leftover.

The photo equals **previousBalance = 0**. That is also the true prior once 1128/1129 are out (hand-trace: running balance 0 before POS/1903).

A successful signed fetch of the **current** ledger outstanding (₹13,150) would print Outstanding **₹13,150** (`previousBalance = 13150 − 16250 = −3100`). The photo did not. So this reprint used previousBalance 0 (true prior-without-duplicates, Dr-only clamp of the ₹3,100 Cr, or the dashboard fetch fallback of 0). It did **not** invent ₹16,250 from a ninth calculator.

---

## 4. Scope SQL (paste one file per run)

Do not click Format SQL first.

| # | File | What |
| --- | --- | --- |
| 1 | `scripts/shreevastav-dup-1-rcp-1128-1129.sql` | Exact 1128/1129 created_at, description, reference_type/id |
| 2 | `scripts/shreevastav-dup-2-gurukrupa-window.sql` | All Gurukrupa POS-template receipts 29–30 May |
| 3 | `scripts/shreevastav-dup-3-gurukrupa-already-settled.sql` | Subset: remaining_before ≤ 0.5 (the duplicate signature) |
| 4 | `scripts/shreevastav-dup-4-velvet-already-settled.sql` | Same signature on VELVET `dafc3d0c-874e-4784-bac3-5eab5f3c85b5` |
| 5 | `scripts/shreevastav-dup-5-all-orgs-headline.sql` | Org headline counts |

Paste 3 is the actionable list. Reconstruct each match the same way as SHREEVASTAV (prior receipts + at-sale vs net) before any mutate. Do not treat paste 2 rows as duplicates — 1127 is the counter-example.

---

## 5. What not to do yet

- Do not soft-delete RCP/1128 or RCP/1129.
- Do not bulk-delete paste 3 until each customer is hand-traced.
- Do not change Gurukrupa print math to “fix” ₹16,250 — it already matches the real prior once the extra receipts are out of the account.
