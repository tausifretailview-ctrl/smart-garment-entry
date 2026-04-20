
Goal: fix the Nazbin Choudhury ledger page so it shows the authoritative balance of ₹0 instead of ₹3,600, and prevent the ledger from drifting again.

What I found
- `src/components/CustomerLedger.tsx` does not use the authoritative balance source. It rebuilds customer totals with its own custom aggregation.
- That ledger aggregation has drift from the approved balance logic:
  1. It references `v.payment_method` but the voucher query does not select `payment_method`, so those skip rules never reliably run.
  2. It mixes `receipt` and `payment` vouchers in the same pass.
  3. It has separate logic from both `useCustomerBalance` and the reconciliation RPC, so Nazbin can be correct in one place and wrong in ledger.
- The top summary card on the ledger page uses `selectedCustomer.balance`, `selectedCustomer.totalPaid`, etc. from this non-authoritative query path, which explains why the ledger still shows ₹3,600.

Implementation plan
1. Make Customer Ledger use the authoritative balance calculation
- Replace the manual summary math in `CustomerLedger.tsx` for business orgs.
- For the selected customer header/cards, use the same balance source as the approved master logic instead of `selectedCustomer.balance` from the list aggregation.
- Prefer a single shared source so Nazbin and all similar accounts render consistently everywhere.

2. Fix the ledger’s voucher aggregation bugs
- Update the voucher select in `CustomerLedger.tsx` to include fields it actually uses (`payment_method`, and any other referenced fields).
- Separate true customer receipts from refunds/adjustments correctly.
- Apply the same legacy-safe ID-match classification already approved for reconciliation:
  - sale-linked by `reference_id -> sales.id`
  - opening-balance payments only when `reference_id` is truly the customer id
  - exclude advance/CN adjustment rows only if the formula also accounts for them consistently

3. Remove duplicate balance drift paths
- Refactor the ledger list/customer summary logic so it does not maintain a third version of customer balance math.
- Reuse either:
  - the authoritative hook logic for selected customer summaries, and/or
  - the reconciliation RPC output for list-level balances.
- Keep transaction rendering separate from summary calculation.

4. Verify Nazbin specifically
- Recheck Nazbin in ELLA BELLA/ELLA NOOR org after the refactor.
- Expected result:
  - Outstanding = ₹0
  - Total sales / paid / returns align with the approved master formula
  - No fake ₹3,600 residual in header, exports, or WhatsApp summary

5. Audit nearby surfaces that likely share the same drift risk
- `src/hooks/useCustomerSearch.tsx`
- exports / WhatsApp summary inside `CustomerLedger.tsx`
- any outstanding/customer list view that still uses local reconstruction instead of the authoritative source

Technical details
- Main file to change: `src/components/CustomerLedger.tsx`
- Supporting file to align if needed: `src/hooks/useCustomerBalance.tsx`
- Likely cleanup target: `src/hooks/useCustomerSearch.tsx`
- Key root cause: duplicated business rules across multiple client aggregations
- Permanent prevention: one authoritative balance path for summary/UI, separate chronological rendering for ledger rows

Verification checklist
- Nazbin shows ₹0 in ledger header
- customer list row for Nazbin also shows settled
- exported PDF/Excel reflect ₹0
- WhatsApp ledger summary reflects ₹0
- spot-check 3–5 other ELLA BELLA customers so the fix does not regress good balances
