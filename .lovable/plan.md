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

A throwaway read-only harness **was never executed** (held; SQL editor 42501 on per-customer RPCs). Substitute: source formulas + named reconstructions in `docs/ssot-two-tier-51-bill-overlap-2026-09-19.md`. Verdict: **none** of C-PARTY / C-REC / C-STMT / C-AUDIT / C-OB-SALES is a confirmed customer-level ground truth. Do not treat family-vs-family equality (ELLA C-PARTY = C-SNAP) as a lock.

Coverage is stated explicitly in the report: exact number of customers tested, how they were chosen, and what share of the org and of total receivable value they represent — so "N customers drift" is never ambiguous. Full population where row counts allow; otherwise a stratified sample weighted to customers with returns, credit notes, advances and multi-receipt invoices, with that rule written out.

## Step 4 — classify every disagreement by shape

(a) FIFO-split SRA, (b) dropped sale-return rows, (c) mis-dated CN-adjust vouchers, (d) duplicate receipt on an already-settled invoice, (e) unused-advance netting (legitimate — reported separately, excluded from the drift count), (f) genuinely new, **(g) C-SNAP compound GREATEST + `paid_at_sale_drift` miss** (two independent effects on one customer's signed total — SHREEVASTAV POS search ₹14,650 = leftover ₹16,250 − 875 GREATEST ₹2,100 + 824 dropped at-sale ₹500; do **not** fold into (d) or FIFO-split).

## Step 5 — hand-verify anything new

For bucket (f) only, verify 3–5 real customers line by line against actual invoices, returns, receipts and advances before calling it a confirmed bug.

## Step 6 — migration-order recommendation (two tiers)

Working order (19 Sep 2026 — `docs/ssot-two-tier-51-bill-overlap-2026-09-19.md`):

**Tier 1 — invoice-level (confirmed):** this-bill / Select Invoices / print Balance → leftover (`reconcileSaleInvoiceWithSplit`). POS/1903 print ₹16,250.

**Tier 2 — customer/org-level (must be built, not selected):** leftover does **not** generalize. None of C-PARTY, C-REC/C-TRUE, C-STMT, C-AUDIT, C-OB-SALES is confirmed clean against a hand-reconstructed customer total. C-PARTY/C-SNAP/C-REC share SNAP `GREATEST(0, tender−receipts)` (bucket g). C-JS/C-AUDIT share GREATEST absorb. C-OB-SALES is known wrong. C-STMT SQL is not in this repo. Installing C-PARTY because it matches C-SNAP on ELLA overlap installs the SNAP bug into KPI cards.

Do **not** start the 51-bill mutate. Named overlap: SHREEVASTAV / VIMLA / DIYA stay **WAIT** (SNAP drop survives the delete). Velvet tender=0 still needs a sibling SNAP-drop scan. Repairing 1128/1129 alone leaves C-JS at ₹16,250 or ₹17,250 and C-SNAP at **₹17,750**.

The Step 3 9-way live harness was **never run** (held; no JWT). Formula + named reconstructions substitute until an org-member paste exists.

Full write-up: `docs/shreevastav-pos-search-due-14650-2026-09-19.md` and `docs/ssot-two-tier-51-bill-overlap-2026-09-19.md`.

## Step 7 — measure KS FOOTWEAR and VELVET

Same comparison, same flagging, same explicit coverage statement. Sizing only; no convergence work started for them.

## Deliverable

A written report in `docs/`, raw drift findings and the migration-order recommendation in clearly separate sections, ranked by rupee impact and customer count, plus a chat summary of the headline numbers.

## Technical notes

- SQL families read via read-only queries: `get_customer_party_balances` / `_get_customer_party_balances_rows`, `get_customer_financial_snapshot*`, `reconcile_customer_balance(s)`, `get_customer_true_outstanding`, `get_customer_ledger_statement`.
- JS families run through the app's own modules (`customerBalanceCore.ts`, `customerLedgerReconciliation.ts`, `customerAuditMath.ts`, `customerAccountStateView.ts`) so the comparison exercises the real code path rather than a re-implementation.
- Harness scripts live under `/tmp`; nothing is added to the app and no migration is written. The only file created in the project is the report under `docs/`.
