# Customer balance drift audit — measurement only, no fixes

Read-only audit across all customer-balance calculations, ending in one written report that ranks drift by rupees and customers, and recommends the order in which the calculations should be merged into one.

No RPC, data, or app code changes in this pass.

## Point 1 — where the printed bill's balance comes from (already traced)

The printed POS bill's Prev Bal / Balance / Total Due block is **not a ninth formula**. It calls `fetchInvoicePrintAccountFacets` (`src/utils/customerAccountStateView.ts`), which loads the customer audit bundle and runs `getCustomerAccountState` — the C-JS family — then subtracts the current bill via `invoiceAccountDue` helpers.

Two consequences to confirm with live data in the audit:
- Print shows **Outstanding** (invoice leftover), not Net Position, so it legitimately differs from any net-of-advance surface.
- Because it reads C-JS from raw transactions, it does not inherit SQL-side party/ledger bugs — which explains why Shreevastav's printed ₹16,250 was right while the ledger showed ₹13,150. The audit will verify this is structural, not luck, by checking whether C-JS itself is immune to duplicate-receipt double counting (a duplicate receipt is real voucher data, so C-JS may in fact be exposed — this is the one open question worth proving either way, since it is the number the customer takes home).

## Point 2 — run every formula against real ELLA NOOR customers

Build a read-only comparison harness (throwaway script, not shipped app code) that, for a sizeable real sample of ELLA NOOR customers, computes: C-JS, C-RECON-LEDGER, C-PARTY, C-SNAP, C-REC/C-TRUE, C-STMT, C-AUDIT, C-OB-SALES, and the print value. Flag every customer where any two sources differ by more than ₹1.

## Point 3 — classify every disagreement by known shape

Buckets: (a) FIFO-split SRA, (b) dropped sale-return rows, (c) mis-dated CN-adjust vouchers, (d) duplicate receipt on an already-settled invoice, (e) unused-advance netting (legitimate — reported separately, excluded from the drift count), (f) genuinely new.

## Point 4 — hand-verify anything new

For bucket (f) only, verify 3–5 real customers line by line against their actual invoices, returns, receipts and advances before calling it a confirmed bug.

## Point 5 — migration-order recommendation

Which families converge first and in what order, and which are allowed to keep computing something different. Outstanding vs Net Position is the known legitimate divergence; the report states explicitly whether any other family has a legitimate reason, or whether all remaining difference is bug-class.

## Point 6 — measure KS FOOTWEAR and VELVET

Same comparison, same flagging, purely to size their drift. No convergence work started for them.

## Point 7 — 30-May duplicate-receipt sweep

For orgs GURUKRUPA (e8fbf0d8…) and dafc3d0c…, find every receipt in the 29–30 May window whose referenced invoice was already fully settled before that receipt landed. Report full count and total rupees per org.

## Deliverable

A written report saved in `docs/`, with raw drift findings and the migration-order recommendation as clearly separate sections, ranked by rupee impact and customer count. Summary of the headline numbers posted in chat.

## Technical notes

- Sources read: `get_customer_party_balances` / `_get_customer_party_balances_rows`, `get_customer_financial_snapshot*`, `reconcile_customer_balance(s)`, `get_customer_true_outstanding`, `get_customer_ledger_statement`, plus the JS families in `customerBalanceCore.ts`, `customerLedgerReconciliation.ts`, `customerAuditMath.ts`, `customerAccountStateView.ts`.
- SQL families run via read queries; JS families run through a Node script using the same modules the app uses, so the comparison is the real code path, not a re-implementation.
- Sampling: full population where the row count allows; otherwise a stratified sample weighted to customers with returns, credit notes, advances and multi-receipt invoices, with the sampling rule stated in the report.
- Scripts live under `/tmp`; nothing is added to the app, and no migration is written.
