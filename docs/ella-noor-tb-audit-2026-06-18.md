# ELLA NOOR — Trial Balance audit, before-state (2026-06-18)

- Org id: `3fdca631-1e0c-4417-9704-421f5129ff67`
- As-of date: all-time (`9999-12-31`)
- Source: `scripts/trial-balance-audit.sql`
- Posting backlog: **0** sales / 0 purchases / 0 SR / 0 PR — every operational
  row already has a journal. So differences below are **mapping bugs**, not
  missing postings.

## 1. GL Trial Balance (posted journals)

```text
Code  Account                  Dr             Cr             Net Dr
1000  Cash in Hand             60,75,210      50             60,75,160
1010  Bank Account             1,42,74,605    1,09,075       1,41,65,530
1200  Accounts Receivable      1,03,93,154    79,75,001      24,18,153
1300  Stock-in-Hand            9,20,121       16,97,449      -7,77,328
2000  Accounts Payable         16,831         1,70,61,424    -1,70,44,593
2150  Customer Advances        23,65,529      24,64,961      -99,432
4000  Sales Revenue            0              2,36,12,211    -2,36,12,211
4010  Trade Discount Given     17,450         0              17,450
4050  Sales Returns            10,41,650      0              10,41,650
5000  Cost of Goods Sold       1,78,38,752    63,367         1,78,38,752
5050  Purchase Returns         0              16,831         -16,831
6900  Round Off                0              6,300          -6,300
       TOTAL                   5,30,06,669    5,30,06,669    0           ✔ balanced
```

## 2. GL bucket vs operational source — drift table

```text
Bucket                                                   GL              Operational     Drift           Status
Sales Revenue (Cr)        vs sales.net_amount            2,36,12,211     2,29,93,987     +6,18,224       INVESTIGATE
Sales Returns (Dr)        vs sale_returns.net_amount     10,41,650       8,77,650        +1,64,000       INVESTIGATE
Accounts Payable (Cr)     vs purchases - PR              1,70,44,593     1,68,43,874     +2,00,719       INVESTIGATE
Purchase Returns (Cr)     vs purchase_returns.net_amount 16,831          16,831          0               clean
Stock-in-Hand (Dr)        vs current stock valuation     -7,77,328       27,23,468       -35,00,796      INVESTIGATE
COGS (Dr) — informational                                1,78,38,752     —               —               needs P&L tie-out
Cash + Bank (Dr) — info, owner cash-count tie-out        2,02,40,690     —               —               needs daily-tally tie-out
```

## 3. Root-cause notes per drift

### Sales Revenue +6.18 L
- GST is not split out of revenue (no `2110/2120` accounts in COA), but ELLA NOOR
  bills at 0% GST — only ₹1,297 of inclusive GST in `sale_items` — so the gap
  is not tax.
- `sales.gross_amount − discount − flat_discount + other_charges = sales.net_amount`
  reconciles (2,36,95,520 − 6,97,941 − 11,600 + 8,008 = 2,29,93,987).
- GL Revenue equals roughly `sales.gross_amount − some_discounts`. The journal
  writer is currently using `gross_amount` instead of `net_amount` for the
  Sales Revenue credit, and posting Trade Discount Given (17,450) and Sales
  Returns (10,41,650) as separate lines. Even so the residual ≈ ₹6,18,224 is
  unaccounted — likely double-counted credit-note-adjusted invoices.
- **Fix:** Step 3 rewrites `postSaleJournal` to use net taxable + split tax +
  split round-off, and ensures discounts/returns are not double-booked.

### Sales Returns +1.64 L
- GL Sales Returns 10,41,650 > `sale_returns.net_amount` 8,77,650.
- 154 active sale returns; some have produced **two** journal entries (return
  itself + CN application reversal). Needs row-level reconciliation between
  `journal_entries.reference_id` and `sale_returns.id` / `credit_notes.id`.
- **Fix:** Step 3 reset + backfill collapses to a single SR journal per
  return id.

### Accounts Payable +2.00 L
- `purchase_bills.paid_amount = 0` across the entire org. AP carries
  ₹1,70,44,593, purchase net is ₹1,68,60,705. The ₹2,00,719 over-credit
  matches purchase items with discount/rounding that are being booked into AP
  at gross-of-discount but `net_amount` already nets them — same
  gross-vs-net symptom as sales.
- **Critical separate finding:** every single one of the 23 `voucher_type='payment'`
  rows is a **customer refund** (advance refund / sale-return refund), *not*
  a supplier payment. The org has no way today to record paying a supplier;
  this is why AP never reduces. Step 6 introduces a supplier-payment writer.
- **Fix:** Step 4 rewrites `postPurchaseJournal` to use net-of-discount AP, and
  Step 6 adds supplier-payment journals + `purchase_bills.paid_amount` sync.

### Stock-in-Hand −35.00 L
- GL shows **negative** stock of −₹7,77,328 (impossible). Current actual stock
  valuation = ₹27,23,468. Gap = ₹35,00,796.
- Cause: COGS (₹1,78,38,752) > Stock booked through purchases (~₹1,68,60,705),
  because **no opening stock** has been seeded.
- **Fix:** Step 7 — opening-balance loader writes
  `Dr 1300 Stock-in-Hand / Cr 3000 Owner's Capital` for the period-start
  valuation. After backfill, Stock-in-Hand should match the live valuation
  within rounding.

### Cash & Bank closing 2.02 Cr (informational)
- Cash 1000: Dr 60.75 L / Cr ₹50; Bank 1010: Dr 1.42 Cr / Cr ₹1.09 L.
- Money goes in (receipts) but nothing comes out — no expense vouchers, no
  supplier payments, no salary, no drawings. Closing cash is therefore
  inflated by the missing-expense, missing-supplier-payment, and missing
  drawings journals.
- `voucher_entries.expense` count = **0**; `voucher_entries.salary` count = **0**.
  Either the org records expenses elsewhere (need to ask owner) or the expense
  module is dormant. Step 5 wires whatever exists into GL.

## 4. Approved next actions

1. **Step 1 ✓ — baseline captured (this document + `scripts/trial-balance-audit.sql`).**
2. Step 2 — seed missing COA (GST, Equity, Expense ledgers).
3. Step 3 — rewrite `postSaleJournal` to use net + tax-split + collapse SR.
4. Step 4 — rewrite `postPurchaseJournal` (net AP, tax-split).
5. Step 5 — post expense + salary vouchers into GL.
6. Step 6 — supplier-payment journals + `purchase_bills.paid_amount` sync trigger.
7. Step 7 — opening-balance loader (Stock, Cash, Bank, AR/AP, Capital).
8. Step 8 — `AccountingReports` UI: group by Tally tree, fix P&L sign convention.
9. Step 9 — `AccountingReconciliation` page + nightly `tb_reconciliation_log`.
10. Step 10 — roll out to all orgs.

Re-run `scripts/trial-balance-audit.sql` after each step. Target:
all rows in the drift table show `status = clean` (|drift| ≤ ₹0.50).