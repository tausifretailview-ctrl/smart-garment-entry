# Cards Verification Report — ELLA NOOR (3fdca631…)

Audited live DB vs. what each card renders on **20 Jun 2026**.

## 1. Outstanding Headline (top of Accounts page)

| Card | Shown | Raw DB recompute | Verdict |
|---|---|---|---|
| Total Receivable | ₹26,33,107 (from `get_accounts_dashboard_metrics`) | True net = Gross AR ₹23,11,557 − Customer credit pool ₹22,84,834 = **₹26,723** | **Wrong** — overstated by ~₹26 L |
| Total Payable | ₹1,68,60,704 | Open bills ₹1,68,60,704; supplier payment vouchers = **₹0** recorded | **Wrong (or no payments captured)** — needs decision |

Root cause receivable:
- Headline is supposed to use `reconcile_customer_balances` RPC (master, includes credit-pool netting & opening balances), but the RPC times out for ELLA NOOR (7,452 customers, 3,158 sales — server cancels statement). UI then falls back to `dashboardStats.totalReceivables`, which is invoice-arithmetic only and ignores the ₹22.84 L unused-advance pool.
- Even the fallback is mis-summed: it misses **₹3,27,750 of "completed-but-not-fully-paid" drift** (status=completed sales where paid_amount < net_amount).

Root cause payable: there are **0 supplier-payment voucher_entries** in this org (only 3 credit-notes worth ₹62,831). Either (a) payments are tracked off-system and the card has no way to net, or (b) historical paid_amount on `purchase_bills` was never backfilled (all 171 bills show paid_amount = 0).

## 2. Account Management 8-tile cards

| Tile | Shown | DB recompute | Verdict |
|---|---|---|---|
| Total Invoices | 3,039 / ₹2,29,15,987 | 3,039 / ₹2,29,15,987 (excl 51 cancelled + 68 pending-cancelled) | OK |
| Paid | 2,642 / ₹1,98,55,620 | 2,642 / ₹1,98,55,620 | OK (count) — but actual `paid_amount` is ₹1,95,27,870 → **₹3.27 L gap** silently labelled "Paid" |
| Partial | 85 / ₹8,61,900 | 85 / ₹8,61,900 net (only ₹4,27,260 collected) | **Misleading** — "Partial amount" shows invoice total, not balance due (₹4,34,640) |
| Pending | 312 / ₹21,98,467 | 312 / ₹21,98,467 | OK |
| Receivables | ₹26,33,107 | True ₹26,723 (or gross ₹23,11,557) | **Wrong** (see §1) |
| Payables | ₹1,68,60,704 | ₹1,68,60,704 (no payments netted) | **Wrong / no source** (see §1) |
| Expenses (month) | ₹0 | ₹0 | OK |
| Month P/L | ₹22,64,571 | sales 27,06,444 − purchase 4,41,873 − exp 0 = 22,64,571 | OK arithmetically, **but** ignores returns, discounts beyond net, and supplier payments |

## 3. Customer Ledger tab totals

- Same `reconcile_customer_balances` RPC powers per-row balances → **times out at org-level scan** for 7,452 customers, so totals strip is either empty, stale, or shows fallback aggregates.
- Per-customer reconcile (single row) works correctly — verified on top customer: invoiced ₹4,04,100, receipts ₹2,33,150, advances applied ₹2,51,800 → balance −₹80,850 (credit).

## 4. Supplier Ledger tab totals

- All 7 suppliers, 171 bills, **0 supplier-payment vouchers recorded**.
- Tab will show full bill totals as outstanding (₹1,68,60,704). Matches headline but is not a real "still owed" figure.

---

## Proposed fixes (in priority order)

### A. Fix Receivable card — make headline match Customer Reconciliation page
1. Stop falling back to the unsigned `dashboardStats.totalReceivables`. When `reconcile_customer_balances` is unavailable, show "Calculating…" instead of a wrong number.
2. **Optimise** `reconcile_customer_balances` so it returns in <30 s for 7 k+ customers (today it exceeds the 120 s server statement_timeout):
   - Replace the per-customer SQL-language wrapper with one set-based query that aggregates `sales`, `voucher_entries`, `customer_advances`, `customer_balance_adjustments` org-wide and joins to `customers`.
   - Add `(organization_id, customer_id) WHERE deleted_at IS NULL` indexes on `sales`, `voucher_entries`, `customer_advances`.
3. Cache the result for 60 s in the front-end (`useOrganizationReceivablesSummary`) and invalidate on any sale/receipt mutation.

### B. Fix invoice-stats card semantics
4. In `get_accounts_dashboard_metrics`, expose `pendingBalance` = Σ(net − paid) for pending + partial + completed-drift, and surface that on the **Pending / Partial / Paid** tiles as the secondary value. Today "Partial = ₹8,61,900" looks like balance-due but is invoice total.
5. Add a footnote tile or warning when `completed.paid_amount < completed.net_amount` (₹3,27,750 drift today) — this is a data-integrity flag, not a card value.

### C. Fix Payable card
6. Compute payable as `Σ(purchase_bills.net_amount) − Σ(voucher_entries WHERE type='payment' AND reference_type IN ('supplier','SupplierPayment'))` instead of relying on `purchase_bills.paid_amount` (which is `0` for every bill in this org).
7. Add a backfill migration that sets `purchase_bills.paid_amount` from matched supplier-payment vouchers so future reads of the column are correct too.

### D. Customer & Supplier Ledger tab totals
8. Once §A is done, the Customer Ledger tab totals strip auto-corrects (same RPC). Add an explicit `Net receivable / Gross AR / Credit pool` 3-tile strip above the table mirroring the Customer Reconciliation page so the numbers reconcile visually.
9. For Supplier Ledger, swap the totals card to the §C formula and show "Open bills | Paid (vouchers) | Outstanding".

---

## What I want you to confirm before I implement

1. **Supplier payments** — does ELLA NOOR record supplier payments anywhere (vouchers, manual, cash book)? If yes, I need the source table. If no, the Payable card is correct as "bills raised" and we just need to relabel it.
2. **Completed-but-not-paid drift (₹3,27,750)** — should I auto-reconcile these (move to Partial) or leave them and just expose the drift?
3. Pick the fix scope: **(a)** all four sections, or **(b)** only the receivable + payable headline first (fastest user-visible win)?
