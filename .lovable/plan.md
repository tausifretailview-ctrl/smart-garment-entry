
# Accounting accuracy audit — ELLA NOOR (org `3fdca631…ff67`)

Goal: prove every figure on the Accounting reports (Trial Balance → P&L → Balance Sheet → Ledgers) ties back to the operational source data (sales, purchases, returns, vouchers, stock). Fix the gaps in ELLA NOOR first, then ship the fix for all orgs.

---

## 1. Snapshot of current GL Trial Balance (all-time, posted journals only)

```text
Code  Account                  Dr            Cr            Net Dr
1000  Cash in Hand             60,75,210     50            60,75,160
1010  Bank Account             1,42,74,605   1,09,075      1,41,65,530
1200  Accounts Receivable      1,03,89,904   79,75,001     24,14,903
1300  Stock-in-Hand            9,20,121      16,95,049     -7,74,928
2000  Accounts Payable         16,831        1,70,61,424   -1,70,44,593
2150  Customer Advances        23,65,529     24,64,961     -99,432
4000  Sales Revenue            0             2,36,08,961   -2,36,08,961
4010  Trade Discount Given     17,450        0             17,450
4050  Sales Returns            10,41,650     0             10,41,650
5000  Cost of Goods Sold       1,78,99,719   63,367        1,78,36,352
5050  Purchase Returns         0             16,831        -16,831
6900  Round Off                0             6,300         -6,300
       TOTAL                   5,30,01,019   5,30,01,019   0          ✔ balanced
```

Operational source totals pulled the same instant:

```text
Sales (active, non-cancelled)         net 2,29,90,737   paid 1,99,55,130   sr-adjust 6,49,300
Sale returns (active)                 net 8,77,650
Purchase bills (active)               net 1,68,60,705   paid 0
Purchase returns (active)             net 16,831
Vouchers — receipts 3,069 / 2,01,90,980 | payments 23 / 90,350 | expenses 0 / 0 | credit_note 3 / 62,831
Journal posting backlog                0 sales · 0 purchases · 0 SR · 0 PR  (good)
```

DR = CR ⇒ books are arithmetically balanced. But the **mapping** has clear gaps below.

---

## 2. Findings (severity-ordered)

### A. Sales Revenue is GROSS-of-tax and net-of-nothing-consistent
- GL Sales Revenue **Cr 2,36,08,961** but `sales.net_amount` total is **2,29,90,737**.
- Diff ≈ ₹6,18,224. No `2110/2120 Output CGST/SGST/IGST` account exists in COA → **GST collected on sales is being booked inside Sales Revenue**. This breaks GSTR reconciliation from the GL.

### B. No Input GST / Output GST ledgers
- COA has no 2100-series tax accounts. Purchase GST is going into Stock/COGS, sale GST into Revenue. Tally/Vyapar parity requires:
  - 2110 Output CGST · 2120 Output SGST · 2130 Output IGST
  - 1410 Input CGST · 1420 Input SGST · 1430 Input IGST
- Phase-A seed in `docs/accounting-tally-v2-cutover.md` mentions GST split for purchases but the accounts don't exist for ELLA NOOR.

### C. No Expense ledgers in GL
- `voucher_entries` has **0** `expense` and **0** `salary` rows for ELLA NOOR. Either the org genuinely records no expenses (unlikely) or expense vouchers are written under a different `voucher_type`/category and never posted.
- COA has no 6xxx expense accounts beyond Round Off (6900). P&L therefore shows only COGS — Net Profit is overstated.

### D. Accounts Payable not being relieved
- AP carries Cr ₹1,70,44,593 against purchases of ₹1,68,60,705. `purchase_bills.paid_amount` is **0** for the entire org, and only 23 supplier-payment vouchers exist (₹90,350). Two possibilities:
  1. Real — owner pays cash on delivery off-book → then we must post `Dr AP / Cr Cash` automatically when bill is marked paid.
  2. Bug — supplier payments are written somewhere (cash book / settlement) but not flowing into `purchase_bills.paid_amount` nor into journals. Need to audit `voucher_entries` filtered to supplier reference, plus any direct UPDATEs to `purchase_bills.paid_amount`.

### E. Sales Returns classified as Revenue type, not contra-revenue
- `account_type='Revenue'` for 4050 Sales Returns and 4010 Trade Discount → P&L will add them to revenue instead of subtracting. Need `account_type='Contra Revenue'` (or report-level sign flip) so Net Sales = 4000 − 4050 − 4010.
- Also: SR amount in GL is ₹10,41,650 but `sale_returns.net_amount` total is **₹8,77,650** — gap ₹1,64,000. Likely double-posting (return both as journal and as reversal via CN application) or stale/duplicate journal entries. Needs row-level reconciliation.

### F. Sale-return application gap on invoices
- `Σ sale_returns.net_amount = 8,77,650` vs `Σ sales.sale_return_adjust = 6,49,300` → **₹2,28,350** of returns are held as unapplied Credit Note credit. Matches the bill-wise reminder bug class we already fixed at the UI level — confirms the underlying data is fine but the *operational vs accounting* views need a single reconciliation source.

### G. No Capital / Owner's Equity / Retained Earnings ledgers
- No 3000-series equity account. A real trial balance must include Owner's Capital + Opening Stock + Drawings, otherwise the Balance Sheet won't balance once an Opening Balance pass is done.

### H. No Opening Balances loaded
- `ledger_opening_balances` page exists but for ELLA NOOR the GL only contains transaction-period data. Prior-year cash/bank/stock/debtor/creditor positions are not seeded → first-year P&L is meaningful but Balance Sheet as-of any date < first sale is empty.

### I. Cash & Bank are receipt-only
- Cash 1000: Dr 60.75 L / Cr ₹50. Bank 1010: Dr 1.42 Cr / Cr ₹1.09 L. Money goes in, nothing goes out (no expense / supplier payment / drawing journals). Cash/Bank closing balance is therefore inflated by the missing-expense issue (C) and missing-supplier-payment issue (D).

### J. Stock-in-Hand is negative (−₹7.74 L)
- COGS posted > Stock added through purchases (because opening stock is missing). Once H is fixed (load opening stock as `Dr 1300 / Cr 3000`), this should turn positive and reconcile to `stock_valuation` from `useStockValuation`.

---

## 3. Reconciliation plan — step-by-step, in this order

### Step 1 — Lock the audit baseline (read-only)
- Add `scripts/ella-noor-trial-balance-audit.sql` that, for a given org + as-of-date, prints:
  - GL TB grouped by account
  - Operational totals (sales gross/net/GST/paid, purchases, returns, vouchers by type, expense module, employee salary, stock valuation)
  - Diff rows (GL − operational) per bucket with ₹ thresholds (₹0.50 = clean, >₹1 = drift)
- Run for ELLA NOOR; commit the report as `docs/ella-noor-tb-audit-2026-06-18.md` so we have a before-state.

### Step 2 — Seed missing system accounts (Phase A.2)
Migration that, for **every org**, idempotently ensures the following accounts exist:
- 1410/1420/1430 Input CGST/SGST/IGST (Asset)
- 2110/2120/2130 Output CGST/SGST/IGST (Liability)
- 3000 Owner's Capital · 3100 Drawings · 3200 Retained Earnings (Equity — new type)
- 6000 series: Rent, Electricity, Salaries, Bank Charges, Discount Allowed, Round Off (already exists), Misc Expense
- Mark 4010 Trade Discount Given and 4050 Sales Returns as `account_type='ContraRevenue'` so the P&L formula subtracts them naturally.

### Step 3 — Re-post sales / sale-returns with GST split
Rewrite `postSaleJournal` so a tax invoice splits:
```text
Dr Cash/Bank/AR            net total
   Cr Sales Revenue        taxable value
   Cr Output CGST          cgst
   Cr Output SGST          sgst
   Cr Output IGST          igst
   Cr Round Off            rounding gain (or Dr if loss)
Dr COGS / Cr Stock         cogs amount
```
Same shape (reversed) for sale returns. Then run **Accounts → Reset GL ledger → Backfill** for ELLA NOOR per the existing cutover runbook.

### Step 4 — Re-post purchases with GST split
Rewrite `postPurchaseJournal`:
```text
Dr Stock-in-Hand           taxable value
Dr Input CGST              cgst
Dr Input SGST              sgst
Dr Input IGST              igst
   Cr Accounts Payable     gross / cash / bank as applicable
```
Mirror for purchase returns.

### Step 5 — Wire expense module + employee salary into GL
- `voucher_entries` rows where `voucher_type IN ('expense','salary')` must post:
  - Dr `<expense ledger from voucher.category mapping>` · Cr Cash/Bank
- Add the category→ledger map in `src/utils/accounting/expenseCategoryMap.ts` and a backfill task that walks historical expense vouchers.

### Step 6 — Wire supplier-payment vouchers into GL & `purchase_bills.paid_amount`
- Audit who writes supplier payments today (Accounts → Supplier Payment tab uses `voucher_entries.voucher_type='payment'` with supplier reference). Confirm they bump `purchase_bills.paid_amount` via trigger; if not, add a trigger `trg_sync_purchase_paid_from_vouchers` mirroring the existing sale trigger.
- Journal: Dr Accounts Payable · Cr Cash/Bank.

### Step 7 — Opening Balance loader
- The existing `LedgerOpeningBalances.tsx` page must, on save, emit a single journal entry dated `period_start − 1` :
  - Dr Stock-in-Hand, Cash, Bank, AR (per customer subledger)
  - Cr AP (per supplier subledger), Customer Advances, Owner's Capital (plug)
- This fixes the negative Stock-in-Hand and lets Balance Sheet balance at any historical date.

### Step 8 — Report-level fixes in `accountingReportUtils.ts`
- `calculateGlTrialBalance` already returns rows — group by `account_group` for Tally-style Primary → Group → Ledger tree (utility already exists in `tallyAccountGroups.ts`, wire it into the page).
- P&L: subtract Contra Revenue, show Gross Profit (Sales − COGS), then Operating Expenses, then Net Profit. Compare against `calculateProfitLoss` (operational) — they must agree to ₹1.
- Balance Sheet: present Assets / Liabilities / Equity with party subledger drill-down (use `journal_lines.party_id`).

### Step 9 — Cross-check page (new)
- New page `src/pages/AccountingReconciliation.tsx` (admin-only) that shows side-by-side: GL bucket vs operational bucket vs diff for sales, purchases, returns, receipts, payments, stock. Hard-coded tolerance ₹0.50; anything bigger blocks "✔ Reconciled" badge.
- Bonus: nightly `pg_cron` job persists a `tb_reconciliation_log` row per org so drifts are visible the day they appear.

### Step 10 — Roll out to all orgs
- Once ELLA NOOR shows ✔ Reconciled on every bucket, run the migration + backfill for all active orgs (one-by-one, with the existing Reset GL → Backfill button) and watch `tb_reconciliation_log` for drift.

---

## 4. Out of scope for this plan
- Schema redesign of `journal_entries` / `journal_lines` (current schema is sufficient).
- Tally XML / Vyapar JSON import-export (already partially in `TallyExport.tsx`; verify only after Steps 2–8 land).
- Bank reconciliation UI changes (separate workstream).

---

## 5. Deliverables when implementation starts
1. `scripts/ella-noor-trial-balance-audit.sql` + `docs/ella-noor-tb-audit-2026-06-18.md` (before/after).
2. Migrations: `phase_a2_seed_gst_equity_expense_accounts.sql`, `phase_a3_repost_gst_split.sql`, `phase_a4_expense_salary_supplier_payment_gl.sql`.
3. Code: updated `postSaleJournal`, `postPurchaseJournal`, new `postExpenseJournal`, `postSalaryJournal`, `postSupplierPaymentJournal`, expense-category map, opening-balance writer.
4. New `AccountingReconciliation.tsx` page + nightly `tb_reconciliation_log`.
5. Updated cutover runbook `docs/accounting-tally-v2-cutover.md` with Steps 2–10.

Approve this and I'll start with Step 1 (audit SQL + before-state report) so we have a measurable baseline before touching any journal logic.
