# Duplicate receipts — Steps 1–3 findings (read-only, 19-Sep-2026)

No code, RPC, or data was changed. All figures are from live production.

---

## STEP 1 — MASEERA ₹19,100: answer = **(c) neither — it is a measurement artefact**

Customer `MASEERA` (`d149b0b0-…`), ELLA NOOR. Full live reconstruction:

| Doc | Date | Net | paid_amount | sale_return_adjust |
|---|---|---|---|---|
| INV/26-27/3122 | 09-Sep | 8,400 | 0 | 8,400 |
| POS/26-27/51 | 09-Sep | 15,250 | 15,250 | 0 |
| POS/26-27/52 | 09-Sep | 16,800 | 16,800 | 0 |
| INV/26-27/3123 | 18-Sep | 10,700 | 0 | 10,700 |

Sale returns: SR/26-27/159 ₹9,400 (adjusted, 0 left), SR/26-27/160 ₹13,850
(partially adjusted, ₹4,150 left). Credit issued 23,250; credit applied
8,400 + 10,700 = 19,100; residue 4,150 — internally consistent.

Receipt vouchers on her account (all three, 18-Sep):

- RCP/4837 ₹8,400 `credit_note_adjustment` → INV/3122
- RCP/4838 ₹1,000 + RCP/4839 ₹9,700 `credit_note_adjustment` → INV/3123

These are **memo receipts** written by the `apply_credit_note_to_sale` RPC as the
audit trail of the same CN application already recorded in `sale_return_adjust`.
`getCustomerAccountState` excludes them (`isCreditNoteApplicationReceiptLedgerAligned`,
`customerBalanceCore.ts:61-79`), so her balance is **correct**: ₹0 owed, ₹4,150 credit held.

So: **not (a)** — no second cash receipt exists; **not (b)** — Phase 1 (PR #766/#768)
is not regressed. The ₹19,100 is the drift scan counting the memo receipt *and*
`sale_return_adjust` as two credits for one event. Same defect class as the
PHANTOM_CREDIT false positives fixed yesterday, on a different scan.

### This artefact contaminates the 168-bill headline

Re-sized live, splitting bills whose receipts include a CN/advance memo from bills
with only real tender receipts:

| Org | Memo-contaminated bills | ₹ | Pure-cash bills | ₹ | Newest pure-cash |
|---|---|---|---|---|---|
| ELLA NOOR | 104 | 5,71,350 | 13 | 59,600 | 10-Sep |
| VELVET | 2 | 13,225 | 37 | 1,60,690 | 16-Sep |
| Gurukrupa | 1 | 5,100 | 31 | 62,200 | 17-Sep |
| KS FOOTWEAR | 14 | 42,877 | 9 | 12,735 | 09-Sep |
| **Total** | **121** | **₹6,32,552** | **90** | **₹2,95,225** |

The **real duplicate-receipt exposure is ~₹2.95L over ~90 bills**, not ₹7.92L/168.
The memo-contaminated group needs a separate check of the counting rule, not repair.
The 18-Sep "newest instance" in the earlier report was MASEERA herself — i.e. false.
**Genuine duplicates are still occurring** (Gurukrupa 17-Sep, VELVET 16-Sep).

---

## STEP 2 — the validation gap is **present but non-atomic**, not missing

`assertCustomerPaymentWithinOutstandingCap` (`src/utils/invoiceOverpaymentGuard.ts`,
added 07-Aug-2026) *is* wired into every customer-receipt save path:

| Path | Guard |
|---|---|
| POS Dashboard (`POSDashboard.tsx:2179`) | yes |
| Customer Payment Tab (`CustomerPaymentTab.tsx:904`) | yes |
| FloatingPayments (`FloatingPayments.tsx:406`) | yes |
| Payments Dashboard (`PaymentsDashboard.tsx:496`) | yes |
| Sales Invoice Dashboard (`SalesInvoiceDashboard.tsx:2584`) | yes |
| Settle Customer Account (`SettleCustomerAccountDialog.tsx:384`) | yes |
| `apply_credit_note_to_sale` / `apply_customer_advance_to_sale` RPCs | memo path, not tender |

So this is **not a missing guard**. Three concrete holes explain the leakage:

1. **TOCTOU / double-submit race (primary).** The guard is read-then-write with no
   transaction and no unique key. Two submits seconds apart both read the pre-payment
   outstanding and both pass: Gurukrupa 07:29:06 / 07:29:20, MASEERA 09:38:00 / 09:38:03.
2. **Client-side only.** Nothing in the database rejects a receipt that exceeds the
   invoice balance — no constraint, no trigger, no server-side re-check.
3. **Cap basis is selection-scoped.** `fetchFreshCustomerPaymentCap` sums only the
   invoices selected in that dialog, so two dialogs on the same invoice do not see each other.

Post-guard evidence: 8 Gurukrupa, 2 VELVET, 2 KS FOOTWEAR, 1 ELLA NOOR pure-cash
over-credited bills have receipts dated **after 07-Aug-2026**.

**Was the Parishma idempotency-key recommendation ever built?** No — for receipts.
`src/utils/purchaseSaveIdempotency.ts` implements exactly that pattern, but only for
purchase bill saves, in-session and client-side. No equivalent exists for receipts.
Had it existed on receipts, the intra-second pairs above would not exist.

### Proposed fix (not implemented)

- **A. Database idempotency key (root fix).** Partial unique index on active receipt
  vouchers over `(organization_id, reference_id, total_amount, payment_method, voucher_date)`
  or an explicit `client_request_id` column supplied by each save path. Blocks the race
  regardless of which screen fires.
- **B. Server-side balance re-check.** Trigger or SECURITY DEFINER wrapper that recomputes
  invoice outstanding at commit time and rejects a tender receipt exceeding it beyond the
  existing ₹1 tolerance. Excludes memo receipts, so CN/advance application is unaffected.
- **C. Client hardening.** Re-assert the cap inside the same write call and disable the
  submit button until the write settles.

Recommended order: A → B → C. A alone stops the observed population.

---

## STEP 3 — printed-balance exposure (proposal only)

`computeCustomerBalanceCore` (`customerBalanceCore.ts:412-417`) sums every non-memo
receipt unconditionally; no per-invoice cap. Printed Prev Bal comes from
`fetchInvoicePrintAccountFacets`, and `invoicePreviousBalanceFromAccount` clamps at 0,
so a duplicate understates the printed previous balance rupee for rupee — customer-facing.

**Proposed scoped fix:** cap receipt credit per invoice at that invoice's own billed
amount (net + `sale_return_adjust` under the existing pre/post-return `items_gross`
gate), and carry the excess into a reported `overCreditedAmount` facet rather than
silently reducing the balance. Receipts with no `reference_id` (on-account) keep
current behaviour.

**Regression posture:** the change is a no-op for every customer whose per-invoice
receipts do not exceed that invoice's bill, which is all 150+ locked fixtures under
`test/money/` — none encodes an over-credited invoice. Validation before shipping:
run the full `test/money` suite, then replay the affected ~90 live bills and confirm
only those move, by exactly the over-credit amount.

---

## STEP 4 — held

No repair of the historical population and no 9-way convergence work started.
