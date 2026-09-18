# Customer balance drift audit — measurement only, no fixes

Read-only audit across all customer-balance calculations, ending in one written report that ranks drift by rupees and customers, and recommends the order in which the calculations should be merged into one.

No RPC, data, or app code changes in this pass.

## Step 1 (first priority) — the printed bill, and whether it can be fooled

Already traced: the printed POS bill's Prev Bal / Balance / Total Due block is **not a ninth formula**. It calls `fetchInvoicePrintAccountFacets` (`src/utils/customerAccountStateView.ts`), which loads the customer's raw transaction bundle and runs `getCustomerAccountState` — the C-JS family — then subtracts the current bill via the `invoiceAccountDue` helpers. Print shows Outstanding (invoice leftover), never Net Position, which is a legitimate difference from net-of-advance surfaces.

The open question answered before anything else: **is C-JS structurally protected from duplicate-receipt double counting, or did Shreevastav's printed ₹16,250 come out right by luck?** Method: read the receipt-crediting path in `customerBalanceCore` (per-invoice cap vs raw voucher sum), then replay Shreevastav's real vouchers plus variants where the duplicate lands differently (different date, different invoice, unallocated). Definitive verdict reported to you as soon as it is known, not held for the final report.

## Step 2 (second priority) — 30-May duplicate-receipt sweep

For orgs GURUKRUPA (e8fbf0d8…) and dafc3d0c…, find every receipt in the 29–30 May window whose referenced invoice was already fully settled before that receipt landed. Report full count and total rupees per org, and how much is still uncorrected today. Runs ahead of the general comparison because this is live money on real accounts.

## Step 3 — run every formula against real ELLA NOOR customers

A throwaway read-only harness computes, per customer: C-JS, C-RECON-LEDGER, C-PARTY, C-SNAP, C-REC/C-TRUE, C-STMT, C-AUDIT, C-OB-SALES and the print value. Any two sources differing by more than ₹1 is flagged.

Coverage is stated explicitly in the report: exact number of customers tested, how they were chosen, and what share of the org and of total receivable value they represent — so "N customers drift" is never ambiguous. Full population where row counts allow; otherwise a stratified sample weighted to customers with returns, credit notes, advances and multi-receipt invoices, with that rule written out.

## Step 4 — classify every disagreement by shape

(a) FIFO-split SRA, (b) dropped sale-return rows, (c) mis-dated CN-adjust vouchers, (d) duplicate receipt on an already-settled invoice, (e) unused-advance netting (legitimate — reported separately, excluded from the drift count), (f) genuinely new.

## Step 5 — hand-verify anything new

For bucket (f) only, verify 3–5 real customers line by line against actual invoices, returns, receipts and advances before calling it a confirmed bug.

## Step 6 — migration-order recommendation

Which families converge first and in what order, and which may legitimately keep computing something different. Outstanding vs Net Position is the known legitimate case; the report states explicitly whether any other family qualifies or whether the rest is bug-class.

## Step 7 — measure KS FOOTWEAR and VELVET

Same comparison, same flagging, same explicit coverage statement. Sizing only; no convergence work started for them.

## Deliverable

A written report in `docs/`, raw drift findings and the migration-order recommendation in clearly separate sections, ranked by rupee impact and customer count, plus a chat summary of the headline numbers.

## Technical notes

- SQL families read via read-only queries: `get_customer_party_balances` / `_get_customer_party_balances_rows`, `get_customer_financial_snapshot*`, `reconcile_customer_balance(s)`, `get_customer_true_outstanding`, `get_customer_ledger_statement`.
- JS families run through the app's own modules (`customerBalanceCore.ts`, `customerLedgerReconciliation.ts`, `customerAuditMath.ts`, `customerAccountStateView.ts`) so the comparison exercises the real code path rather than a re-implementation.
- Harness scripts live under `/tmp`; nothing is added to the app and no migration is written. The only file created in the project is the report under `docs/`.
