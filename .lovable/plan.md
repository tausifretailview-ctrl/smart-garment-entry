# Customer balance drift audit — measurement only, no fixes

Read-only audit across all customer-balance calculations, ending in one written report that ranks drift by rupees and customers, and recommends the order in which the calculations should be merged into one.

No RPC, data, or app code changes in this pass.

## Step 1 (first priority) — the printed bill, and whether it can be fooled

Already traced: the printed POS bill's this-bill **Balance / Total Due ₹16,250** is **invoice leftover** (`reconcileSaleInvoiceWithSplit` / `invoiceThisBillBalance`), the same family as Payment Receipt Select Invoices and Sales Invoice Dashboard. It is **not** proof that C-JS is right.

Print `previousBalance` still comes from C-JS (`getCustomerAccountState`) minus this bill. On SHREEVASTAV that C-JS outstanding is **₹14,150** (₹2,100 short). Gurukrupa Outstanding/Total Due then **adds this-bill leftover**, so the photographed ₹16,250 can be correct while glance C-JS is wrong.

**C-JS is not structurally protected from duplicate receipts.** It sums voucher credits (1128 and 1129 both count) and only adds at-sale via `computePaidAmountDrift` when `max(paid_amount, tender) > voucherSum`. On POS/875 that gap is 0, so 1129 is absorbed as the GREATEST replacement for discarded at-sale and **1128 still over-credits ₹2,100**. Verdict: printed this-bill leftover was not luck; C-JS glance **was** fooled. Full replay: `docs/shreevastav-pos-search-due-14650-2026-09-19.md`.

## Step 2 (second priority) — 30-May duplicate-receipt sweep

For orgs GURUKRUPA (e8fbf0d8…) and dafc3d0c…, find every receipt in the 29–30 May window whose referenced invoice was already fully settled before that receipt landed. Report full count and total rupees per org, and how much is still uncorrected today. Runs ahead of the general comparison because this is live money on real accounts.

## Step 3 — run every formula against real ELLA NOOR customers

A throwaway read-only harness computes, per customer: C-JS, C-RECON-LEDGER, C-PARTY, C-SNAP, C-REC/C-TRUE, C-STMT, C-AUDIT, C-OB-SALES and the print value. Any two sources differing by more than ₹1 is flagged.

Coverage is stated explicitly in the report: exact number of customers tested, how they were chosen, and what share of the org and of total receivable value they represent — so "N customers drift" is never ambiguous. Full population where row counts allow; otherwise a stratified sample weighted to customers with returns, credit notes, advances and multi-receipt invoices, with that rule written out.

## Step 4 — classify every disagreement by shape

(a) FIFO-split SRA, (b) dropped sale-return rows, (c) mis-dated CN-adjust vouchers, (d) duplicate receipt on an already-settled invoice, (e) unused-advance netting (legitimate — reported separately, excluded from the drift count), (f) genuinely new, **(g) C-SNAP compound GREATEST + `paid_at_sale_drift` miss** (two independent effects on one customer's signed total — SHREEVASTAV POS search ₹14,650 = leftover ₹16,250 − 875 GREATEST ₹2,100 + 824 dropped at-sale ₹500; do **not** fold into (d) or FIFO-split).

## Step 5 — hand-verify anything new

For bucket (f) only, verify 3–5 real customers line by line against actual invoices, returns, receipts and advances before calling it a confirmed bug.

## Step 6 — migration-order recommendation

Working order (SHREEVASTAV 19 Sep 2026 — pending leftover-aggregator scope):

1. **This-bill / Select Invoices / print Balance** → invoice leftover (`reconcileSaleInvoiceWithSplit`). Matched POS/1903 print ₹16,250. **Not** yet Customer Balances list or KPI cards: leftover is per-invoice; `SUM(open leftovers)` omits opening, unused advance, unclaimed CN/SR, unallocated receipts. That aggregator is real work, not a rename.
2. **C-JS demoted** from reliable reference. Live glance ₹14,150. After 1128/1129 repair it *may* hit ₹16,250 only if `paid_amount` still carries 875’s at-sale so drift restores it; a GREATEST rewrite to ₹2,100 leaves C-JS at ₹17,250.
3. **C-RECON-LEDGER** should hit ₹16,250 after the duplicate-row repair (13,150 + 3,100).
4. **C-SNAP does not** converge after that repair. Drift `GREATEST(0, tender − sale receipts)` still drops 875 at-sale (RCP/799 remains) **and** 824 at-sale → predicted **₹17,750**. Bucket (g) needs its own fix.
5. Outstanding vs Net Position remains the known *legitimate* split (unused advance). GREATEST vs leftover vs SNAP-drift are bug-class, not facets.

Full write-up: `docs/shreevastav-pos-search-due-14650-2026-09-19.md` migration-order section.

## Step 7 — measure KS FOOTWEAR and VELVET

Same comparison, same flagging, same explicit coverage statement. Sizing only; no convergence work started for them.

## Deliverable

A written report in `docs/`, raw drift findings and the migration-order recommendation in clearly separate sections, ranked by rupee impact and customer count, plus a chat summary of the headline numbers.

## Technical notes

- SQL families read via read-only queries: `get_customer_party_balances` / `_get_customer_party_balances_rows`, `get_customer_financial_snapshot*`, `reconcile_customer_balance(s)`, `get_customer_true_outstanding`, `get_customer_ledger_statement`.
- JS families run through the app's own modules (`customerBalanceCore.ts`, `customerLedgerReconciliation.ts`, `customerAuditMath.ts`, `customerAccountStateView.ts`) so the comparison exercises the real code path rather than a re-implementation.
- Harness scripts live under `/tmp`; nothing is added to the app and no migration is written. The only file created in the project is the report under `docs/`.
