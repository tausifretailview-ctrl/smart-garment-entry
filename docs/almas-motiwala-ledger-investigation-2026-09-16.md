# ALMAS MOTIWALA (ELLA NOOR) — ledger three-figure split

**Date:** 16 Sep 2026  
**Org:** ELLA NOOR (`3fdca631-1e0c-4417-9704-421f5129ff67`)  
**Customer:** ALMAS MOTIWALA, phone 9920671514  
**Evidence:** `ALMAS_MOTIWALA_Ledger_16-09-2026_99a4.pdf` generated 16 Sep 2026 20:43; Sales Invoice Dashboard screenshot (3 invoices, Pending Amount ₹0).  
**This pass:** facts and root cause only. **No repair.**

Production tenant tables are RLS-blocked from this environment (anon key only). Reconstruction uses the PDF voucher numbers/amounts plus the functions that emit each printed figure. The ₹1,800 recon gap is not a coincidence — it is the CN applied to the **last** linked invoice.

---

## 0. URGENT — 16 Sep 21:07 refund (PAY-00055) + live ₹4,700 button

Second PDF `ALMAS_MOTIWALA_Ledger_16-09-2026__1__da4a.pdf` generated **16 Sep 2026 21:12** (after refund).

**Do not pay the ₹4,700 Refund Overpayment.** True remaining unclaimed credit is **₹0**. The ₹4,700 prompt is the original phantom ₹6,750 minus the ₹2,050 already paid out.

| Step | Amount |
| --- | --- |
| SR/153 stored `net_amount` (real credit generated) | ₹8,550 — Credit column uses this, **not** INV/3005 by coincidence of equal value |
| Applied to INV/3009 | −₹4,700 |
| Applied to INV/3064 | −₹1,800 |
| Already refunded PAY-00055 16 Sep 21:07 | −₹2,050 |
| **True remaining** | **₹0** |

Live 21:12 PDF recon still subtracts Sale Returns **₹6,750** (pass-1-only remaining) then adds CN Refunded **₹2,050** → Outstanding Cr **₹4,700**. Banner and “Refund Overpayment” both use `computeRefundableCreditBalance({ invoiceOutstanding: reconciliation.invoiceOutstanding })` in `CustomerLedger.tsx`.

Arithmetic line **also** flipped to ₹4,700 Cr after the refund: `computeRefundedStandaloneSaleReturnCredit` used `net − linked_sale SRA` = 8550−1800 = **₹6,750**, then `audit (incl. +₹2,050 refund debit) − 6750 = −4700`. Same missing ₹4,700.

Running Balance 8550 Cr → 6500 Cr on the refund row only: `runningBalance +=` refund debit. Cosmetic relative to payout: **the refund amount is NOT taken from that column**; it is `refundableCreditBalance` from recon Outstanding. Same broken remaining feeds the button.

**Scope:** any customer where one SR is FIFO-applied to **two or more later invoices** (`linked_sale_id` last-write-wins) will inflate recon remaining by the earlier CN chunks. After refunding true CAB, the leftover phantom is offered as a second payout. ELLA NOOR already has 72 Farhaan-shape leftover rows (usually one later invoice — lower risk) plus Hanif (one invoice). Split-across-invoices is the live cash-out risk. No production scan from this environment (RLS).

Fix (this branch): `allocateCnAdjustmentsToSaleReturns` pass-2 leftover onto **linked** SRs with unused net; same allocator for refunded-standalone credit.

---

## 1. Source transactions (from the PDF, not from a report total)

| When | Voucher | What | Money |
| --- | --- | --- | --- |
| 08/09/26 19:51 | INV/26-27/3005 | Invoice | ₹8,550 Dr (completed) |
| 08/09/26 19:53 | RCP/26-27/4625 | Cash/UPI/card receipt | ₹8,550 (real money in) |
| 09/09/26 17:44 | SR/26-27/153 | Sale return of that bill | **gross credit ₹8,550** (`displayCredit`; description starts `Sale Return [Partial…`) |
| 09/09/26 17:45 | INV/26-27/3009 | Invoice | ₹4,700; settled by CN (SRA ₹4,700) |
| 09/09/26 | RCP/26-27/4641 | `credit_note_adjustment` vs 3009 | ₹4,700 memo (page 2) |
| 15/09/26 18:06 | INV/26-27/3064 | Invoice | ₹1,800; settled by CN (SRA ₹1,800) |
| 16/09/26 (voucher date) | RCP/26-27/4801 | `credit_note_adjustment` vs 3064 | ₹1,800 memo (page 2) |

No unused advance. No cash refund of the CN.

**Real return value:** SR/153 **₹8,550** (matches INV/3005, Credit column, and `sale_returns.net_amount`). Reconciliation’s −₹6,750 is **not** a different voucher; it is remaining credit after consuming only ₹1,800.

---

## 2. Hand reconstruction (economics)

```
Invoiced                 8,550 + 4,700 + 1,800 = 15,050
Cash received            RCP/4625 only           =  8,550
CN/SR credit generated   SR/153                  =  8,550
CN/SR credit applied     4,700 + 1,800           =  6,500
Unclaimed CN             8,550 − 6,500           =  2,050
Invoice balances         all covered             =      0
Net party position       unclaimed CN            =  2,050 Cr
```

True current position: **customer is owed ₹2,050** (unapplied sale-return credit). They do not owe ₹2,050, ₹6,750, or anything on the three invoices.

---

## 3. The three displayed figures

| Surface | Number | Correct? | Exact function |
| --- | --- | --- | --- |
| PDF banner “Credit balance (Cr)” | ₹6,750 | **Wrong** (+₹4,700) | `computeRefundableCreditBalance` ← `effectiveBalance` = `reconciliation.invoiceOutstanding` = `computeInvoiceOutstandingFromReconciliation` (`CustomerLedger.tsx`). Recon `saleReturns` from `saleReturnCreditForReconciliation(t)` = ledger remaining ₹6,750. |
| PDF arithmetic line | “Customer owes ₹2,050 … Net ₹2,050 Cr · Unclaimed returns ₹2,050” | **Net / unclaimed correct.** “Customer owes” is abs() of a **credit** outstanding — wording is wrong. | `formatCustomerAccountArithmeticLine` ← `fetchCustomerAccountStateView` ← `getCustomerAccountState`. Unclaimed = `computePendingStandaloneSaleReturns` / `saleReturnRemainingCreditForBalance` which **prefers `credit_available_balance` (₹2,050)**. |
| Sales Invoice Dashboard Pending Amount / Balance | ₹0 / Paid | **Correct for invoices.** Silent on party CN. | Per-row `invoiceOutstandingAmount` (`net − paid − sale_return_adjust`). KPI `fetchInvoiceDashboardReconciledPendingAmount` → `sumInvoiceDashboardOutstanding` (clamped ≥ 0). |

Banner arithmetic printed on the PDF:

```
15,050 − 6,500 (SRA on 3009+3064) − 6,750 (recon remaining) − 8,550 cash = −6,750
```

If recon remaining were the true unclaimed ₹2,050:

```
15,050 − 6,500 − 2,050 − 8,550 = −2,050
```

Over-subtraction = ₹4,700 = CN on INV/3009, which `srAppliedMap` never attached to SR/153.

Page 2 “CN available (notes): ₹6,750” is the same remaining: `ledgerDerivedStats.cnAvailable` sums `t.credit` on pending/partial return rows (`CustomerLedger.tsx`), i.e. **₹6,750 again**, not CAB.

---

## 4. SR/153 ₹8,550 vs recon −₹6,750

**Mechanism (not coincidence):**

1. `applyCreditNoteFifoToSale` (`saleSettlement.ts`) after each RPC chunk **overwrites** `sale_returns.linked_sale_id = params.saleId`.
2. 09/09: apply ₹4,700 → INV/3009 → `linked_sale_id` = 3009, CAB ≈ ₹3,850, `partially_adjusted`.
3. 15/16 Sep: apply ₹1,800 → INV/3064 → `linked_sale_id` = **3064 only**, CAB = **₹2,050**.
4. Ledger `srAppliedMap` (`customerLedgerTransactions.ts`) attributes `credit_note_adjustment` vouchers **only** to the SR whose `linked_sale_id` matches the voucher’s `reference_id`. Pass 2 leftover FIFO runs **only for unlinked** SRs.
5. Result: `appliedAmount` = ₹1,800, `absorbedOnInvoice` = min(₹8,550, INV/3064.SRA ₹1,800) = ₹1,800, `consumedAmount` = ₹1,800.
6. Row: `displayCredit` = gross ₹8,550 (Credit column / running Balance). `credit` = remaining ₹6,750 (recon / CN available).
7. `saleReturnCreditForReconciliation`: when `displayCredit > remaining`, use remaining → recon “(-) Sale Returns −₹6,750”.

₹8,550 − ₹6,750 = ₹1,800 = CN on the **current** linked invoice. The ₹4,700 on 3009 sits in `invoiceCnApplied` (from `sales.sale_return_adjust`) **and** is still inside recon `saleReturns` remaining — that is the Farhaan-class double-count, but inverted: remaining is too **large** because linked-sale attribution missed the first application.

`AdjustCustomerCreditNoteDialog` sets `linked_sale_id = null` when one dialog applies to **multiple** invoices in one submit. Almas was two **separate** FIFO applies on two days, so last-write-wins applies.

---

## 5. Running Balance stuck at ₹8,550 Cr

Two stacked rules, both intentional in isolation:

**A. CN application rows are memo.** PDF legend: `[Memo] rows (advance / credit-note applications) are tracing entries only`. `advance_application` / CN apply receipts: `debit/credit 0`, `informational`. The on-table `(info) CN / S/R adjusted on INV/…` rows are `cn_adjusted` from `sale.sale_return_adjust`, also `informational: true` — Balance cell blank, walk skipped (`walkLedgerSignedBalance`).

**B. Invoice running debit is net of SRA, Credit column is gross.**

```ts
invoiceDebit = max(0, grossBill - saleReturnAdjust)  // 4700-4700=0, 1800-1800=0
runningBalance += invoiceDebit
displayDebit = grossBill when gross > invoiceDebit
```

**C. Sale-return running credit is GROSS** (`saleReturnRunningBalanceCredit`) so Hanif-class unpaid later invoices still match column totals.

Walk actually stored in `transaction.balance`:

```
+8,550 INV/3005 − 8,550 cash − 8,550 SR gross + 0 + 0 = −8,550  → prints 8,550 Cr
```

Display column totals (gross Dr/Cr, skip info):

```
15,050 − 17,100 = −2,050
```

PDF “COLUMN TOTALS … Balance ₹8,550 Cr” is **last row**, not Dr−Cr gap. Gap is the true ₹2,050 Cr.

So: memo CN rows not updating Balance is **by design**. Flat ₹8,550 Cr across the two later invoices is **because those invoices add ₹0 to running balance** while the SR row already credited the **full** ₹8,550. Users reasonably expect 8,550 → 3,850 → 2,050. The design that keeps memo rows off the walk **plus** netting SRA off invoice debit **plus** grossing the SR is what freezes the column at unapplied+applied credit.

---

## 6. Isolated vs pattern

Not isolated. Same `linked_sale_id` last-write-wins is in `applyCreditNoteFifoToSale` for every org. ELLA NOOR already has the same remainder class:

| Party | Shape | Notes |
| --- | --- | --- |
| **Hanif bhai** | One later invoice absorbs part of a larger SR | SR/26-27/11 ₹6,250, ₹3,200 applied, CAB ₹3,050. Same `consumedAmount` vs CAB split. Diagnostic: `scripts/ella-noor-hanif-bhai-balance-diagnostic.sql`. |
| **Farhaan Fab** (7977353244) | Partial CN leftover | Canonical remainder ₹100; recon must use remaining not gross (`saleReturnCreditForReconciliation` Farhaan test). Org audit: **72** ELLA rows `n_cn_leftover_sra_fully_in_7sum`. |
| **SHUMAMA BAIRELI** | SRA = CN memos, CAB 0 | Same CN-memo / SRA family; remainder fully consumed. |

Any customer who applies **one** SR across **two or more later invoices on separate FIFO calls** will show recon remaining = gross − **last** application only. Live re-query of extra ELLA names was not possible here (no service role). The code path does not special-case ALMAS.

---

## 7. What is “right” to show (for a later repair; not done here)

- Party position / refundable CN: **₹2,050 Cr** (`getCustomerAccountState` / CAB / `credit_notes.used_amount`).
- Invoice dashboard pending: **₹0** (keep; do not fold unclaimed CN into invoice Balance).
- Ledger recon `saleReturns` should use the same remaining as CAB (₹2,050), not linked-sale-only ₹6,750.
- Running Balance: either consume CN on the walk, or debit later invoices at gross — today it does neither for CN-settled bills, so it prints gross unapplied+applied credit.

Repair must not invent a fourth outstanding formula. Converge ledger `srAppliedMap` / remaining onto `saleReturnRemainingCreditForBalance` / `credit_notes` remaining.
