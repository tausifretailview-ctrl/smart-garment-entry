

## Bug Fix: WhatsApp Outstanding Amount Mismatch

**Problem**: WhatsApp reminder messages show incorrect "Total Outstanding" amounts because they calculate balances only from pending invoice rows, missing opening balance, balance adjustments, customer advances, and sale return credits. The actual ledger (using `useCustomerBalance`) shows ₹10,452 but WhatsApp says ₹7,793.

**Root Cause**: Two places compute balances independently instead of using the authoritative `useCustomerBalance` hook logic:
1. `SalesmanCustomerAccount.tsx` — `sendAllOutstandingReminder` sums only `pendingInvoices` balances
2. `SalesmanCustomerAccount.tsx` — `summary.currentBalance` ignores adjustments, advances, sale returns
3. `SalesmanOutstanding.tsx` — `fetchOutstanding` balance ignores adjustments, advances, sale returns

---

### Fix 1: SalesmanCustomerAccount.tsx — Use `useCustomerBalance` hook

- Import and call `useCustomerBalance(customerId, organizationId)` to get the authoritative balance
- In `sendAllOutstandingReminder`, replace `pendingInvoices.reduce(...)` with the hook's `balance` value for the "Total Outstanding" line
- In `shareStatement`, use the hook's `balance` for the "Outstanding" line
- Update the summary card's "Outstanding" value to use the hook's balance (ensures UI matches WhatsApp message)

### Fix 2: SalesmanOutstanding.tsx — Include adjustments, advances, sale returns

- After fetching sales and vouchers, also fetch `customer_balance_adjustments`, `customer_advances` (active/partially_used), `sale_returns`, and refund `voucher_entries` (voucher_type='payment', reference_type='customer')
- Factor these into each customer's `totalBalance` calculation:
  `balance = opening + invoiceBalance - obPayments + adjustments - unusedAdvances - saleReturns - refunds`
- This ensures the Outstanding list and WhatsApp reminder from this page also show correct amounts

### Fix 3: SalesmanCustomerAccount summary calculation

- Update `fetchCustomerData` summary to also fetch and include:
  - `customer_balance_adjustments` (outstanding_difference sum)
  - `customer_advances` (unused amount for active/partially_used)
  - `sale_returns` (net_amount sum)
  - Refund vouchers (payment type, reference_type='customer')
- Update `currentBalance` formula to match `useCustomerBalance`:
  `currentBalance = opening + totalSales - totalPaid + adjustments - unusedAdvances - saleReturns - refunds`

### Files to modify
1. `src/pages/salesman/SalesmanCustomerAccount.tsx` — Use `useCustomerBalance` hook for WhatsApp messages and summary
2. `src/pages/salesman/SalesmanOutstanding.tsx` — Add missing balance components (adjustments, advances, returns, refunds)

