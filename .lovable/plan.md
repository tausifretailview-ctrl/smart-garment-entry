## Customer Account Integrity — Org-Wide Investigation & Repair Plan

You are right: the Dania Ansari and MAULI FOOTWEAR cases are **symptoms**, not the disease. A scan of every organization confirms the same data classes are corrupted across the system.

### What the org-wide scan shows (all orgs, non-deleted, non-cancelled)

| Defect class | Orgs affected | Total rows | Money at risk |
|---|---|---|---|
| **Mis-tagged receipts** (`reference_type='customer'` but `reference_id` IS a `sales.id`) — the bug that hides ₹16,208 in MAULI's audit screen | 10 | **1,748 receipts** | **₹10.27 Cr** |
| **`sales.paid_amount` ↔ voucher_entries drift** (per-invoice ABS difference > ₹1) | 27 | **18,948 sales** | **₹5.79 Cr absolute drift** |
| **Duplicate / over-paid receipts** (sum of receipts on one bill exceeds the bill) | 4 | 13 invoices | ₹50,481 |
| **Ghost / orphan receipts** (`reference_type='customer'`, no matching sale, customer opening = ₹0) | 6 | 27 receipts | ₹73,201 |
| **Receipts with NULL reference** | 0 | 0 | — |

This is a structural ledger-integrity problem, not isolated data entry. Plan below covers detection, code hardening, repair tooling, and prevention — without changing customer-visible accounting math.

### Scope (what counts as "affecting a customer account")

Every place an amount can move a customer's running balance:

1. `sales` (Dr, gross `net_amount`)
2. `sales.sale_return_adjust` (Cr inside the bill)
3. `sale_returns` + `credit_notes` (Cr, separately or via adjustment)
4. `voucher_entries` `voucher_type='receipt'` (Cr — cash/UPI/card/cheque/bank)
5. `voucher_entries` `voucher_type='receipt'` with `payment_method='advance_adjustment'` (advance applied — memo, NOT cash)
6. `voucher_entries` `voucher_type='receipt'` with `payment_method='credit_note_adjustment'` (CN applied — settles a sale return)
7. `voucher_entries` `voucher_type='credit_note'` (Cr — direct CN)
8. `voucher_entries` `voucher_type='payment'` `reference_type='customer'` (Dr — refund out / advance returned via voucher)
9. `customer_advances` (unused balance Cr)
10. `advance_refunds` (Dr — money returned to customer)
11. `customer_balance_adjustments` (signed `outstanding_difference`)
12. `customers.opening_balance` (Dr or Cr starting line)

Single-source formula already exists (`reconcile_customer_balances` RPC + `useCustomerBalance`) and is correct. Every defect found is in **input data**, **screen-fetch filters**, or **write-time tagging** — not the math.

---

### Phase 1 — Stop the bleeding in the read paths (code only, all UIs converge)

**Goal:** every report — Customer Ledger (classic), Customer Account Statement (audit), Customer Audit Report, mobile Customer Account, Field-Sales Outstanding, Customer Reconciliation — shows the same number for the same customer regardless of how legacy `reference_type` was tagged.

1.1 In `src/utils/customerAuditBundle.ts → fetchCustomerAuditBundle`, add the missing 4th voucher fetch:
```text
voucher_entries
  organization_id = orgId
  voucher_type    = 'receipt'
  reference_type  = 'customer'
  reference_id    IN (saleIds)        ← legacy mis-tagged rows
  deleted_at IS NULL
```
Merge into the existing `voucherById` Map (de-duped by id). This alone closes the ₹10.27 Cr "invisible receipts" gap on the audit screens.

1.2 Audit every other read path that classifies receipts by `reference_type` string and switch them to **id-match against `sales.id`** (rule already documented in `mem://features/accounts/customer-balance-logic`). Files to confirm/repair:
- `src/hooks/useCustomerBalance.tsx`
- `src/components/CustomerLedger.tsx` aggregation
- `src/lib/customerLedger.ts`
- `src/pages/CustomerLedgerPage.tsx`, `CustomerAccountStatementAuditPage.tsx`, `CustomerAuditReport.tsx`, `CustomerLedgerReport.tsx`, `CustomerReconciliation.tsx`
- `src/pages/salesman/SalesmanOutstanding.tsx`, `SalesmanCustomerAccount.tsx`
- `src/pages/portal/PortalAccount.tsx`, `PortalInvoices.tsx`
- `src/pages/mobile/MobileAccountsPage.tsx`
- `src/utils/supplierBalanceUtils.ts` (apply the same lesson on the supplier side, scope this phase to customers)

1.3 Add a single shared classifier helper `classifyReceiptForCustomer(voucher, customerId, saleIds)` returning one of `sale_payment | opening_payment | advance_application | cn_application | unknown` and use it everywhere. This permanently kills the "classify by string" bug class.

1.4 Customer Audit Report: surface a "**Drift / Anomalies**" section showing per-invoice `paid_amount` vs sum-of-receipts mismatch, duplicate/over-payment flags and unmatched receipts so the operator can see issues, not just a final number.

### Phase 2 — Diagnostic surfaces (read-only, ship before any data fix)

2.1 New page **Customer Ledger Health** (admin only) listing, per organization:
- Mis-tagged receipts count + amount
- Over-paid invoices count + ₹ excess
- Ghost / orphan receipts
- `sales.paid_amount` ↔ voucher drift > ₹1 list
- Customers with `reconcile_customer_balances` differing from `useCustomerBalance` by > ₹1

2.2 New SQL view `vw_customer_ledger_anomalies` powering the page (org-scoped). All queries already prototyped in this investigation.

2.3 One-click "Open this customer's audit" deep-link from each anomaly row, pre-filtered to FY range.

### Phase 3 — Write-side hardening (prevent future corruption)

3.1 **Receipt entry path** (`POSContext`, sales payment dialog, advance application dialog, CN application dialog, payment receipt page). Enforce on the client AND in a DB trigger:
- A `receipt` voucher MUST set `reference_type='sale'` whenever `reference_id` resolves to a `sales.id` row in the same organization.
- A `receipt` voucher with `reference_type='customer'` MUST resolve to `customers.id` in the same organization (no sale id allowed).
- `payment_method='advance_adjustment'` and `payment_method='credit_note_adjustment'` MUST have a sale `reference_id` (memo on a specific bill).
- `total_amount > 0`, `discount_amount >= 0`, `total_amount + discount_amount` must not exceed the bill's outstanding for non-advance, non-CN receipts (configurable warning vs hard block per org).

3.2 **`sales.paid_amount` recompute trigger.** After insert/update/soft-delete on `voucher_entries` for a sale, recompute `sales.paid_amount = SUM(non-advance, non-CN voucher.total_amount)` and `payment_status` using the same rule as `reconcileSaleInvoiceDisplay`. This eliminates the 18,948-row drift class permanently.

3.3 **POS cash settlement.** When `paid_amount` is captured on the sale row but no `voucher_entries` row is created (current POS behaviour for full-cash sales), insert a synthetic receipt row inside the same transaction so the ledger source of truth is always vouchers, not the sale row.

3.4 **Soft-delete cascade.** When a `voucher_entries` row is soft-deleted, fire the same recompute. When a sale is soft-deleted, soft-delete its receipts too (already partially done — verify everywhere).

3.5 **Customer balance adjustment** writes must always insert a single signed row and update both `previous_outstanding` and `new_outstanding` from the live computed balance, never from a stale screen value.

### Phase 4 — One-shot historical repair (after Phase 1 & 3 ship)

Each step is its own migration, dry-run report first, executed only after the user reviews counts per org.

4.1 **Re-tag mis-tagged receipts** — set `reference_type='sale'` on every `voucher_type='receipt'` row whose `reference_id` matches a `sales.id` in the same org (1,748 rows). Pure relabel; does not change any amount.

4.2 **Soft-delete duplicate / over-payment receipts** — for each invoice where `SUM(receipt.total_amount) > net_amount - sale_return_adjust + ₹1`, present the candidate rows (newest, identical-amount, same description) for confirmation, then soft-delete.

4.3 **Soft-delete ghost / orphan receipts** — receipts with `reference_type='customer'` whose `reference_id` is neither a sale nor a customer with non-zero opening or unconsumed advance.

4.4 **Recompute `sales.paid_amount` and `payment_status`** for every sale (or those flagged as drifted) using the new trigger logic. Backfill `customer_ledger_entries` (the append-only log) so it matches the recomputed reality.

4.5 **Run `reconcile_customer_balances`** for every org; record per-customer before/after delta into `customer_balance_repair_log` for audit.

### Phase 5 — Verification

5.1 Customer Ledger Health page must show **zero** rows in mis-tagged, ghost, over-paid and drift > ₹1 categories for every org.
5.2 Pick 30 random customers across the 5 largest orgs; reconcile manually against printed/PDF receipts the operator has on file.
5.3 MAULI FOOTWEAR final closing = ₹2,003 (only INV/26-27/350 open) — already proven in the previous round.
5.4 Spot-check Dania Ansari, KS Footwear top-10 outstanding customers, and any customer where the user has previously raised a complaint.

### Out of scope (call out, don't change here)

- Reworking the supplier ledger — same disease likely exists; tackled in a follow-up using the same playbook.
- Switching to `customer_ledger_entries` as the source of truth — currently it's append-only and not used for math; promotion is a separate epic.
- Any change to the Master Reconciliation formula (it's correct; the data feeding it is not).

### Deliverables / files touched (high-level)

- New: `src/utils/classifyReceiptForCustomer.ts`, `src/pages/admin/CustomerLedgerHealth.tsx`, view `vw_customer_ledger_anomalies`, triggers `trg_voucher_recompute_sale_paid` and `trg_voucher_validate_reference`, repair migrations 4.1 → 4.4, log table `customer_balance_repair_log`.
- Edited: `src/utils/customerAuditBundle.ts` (Phase 1.1), every read path listed in Phase 1.2, write paths in Phase 3.1, POS settlement in Phase 3.3.
- Memory: extend `mem://features/accounts/customer-balance-logic` with the id-match invariant and the new triggers; add a constraint memory "Never classify receipts by `reference_type` string — always id-match."

### Sequencing & approval gates

```text
Phase 1  →  ship behind no flag         (read-only, safe)
Phase 2  →  ship                        (read-only diagnostics)
Phase 3  →  ship triggers + write guards (with feature flag per org for 1 week)
Phase 4  →  per-org, dry-run → user approves counts → execute migration
Phase 5  →  health page green
```

If you approve this plan I'll start with **Phase 1.1 + the diagnostic queries packaged into a Health page** so you can see the full org-by-org damage list before any data is touched.
