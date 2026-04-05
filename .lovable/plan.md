

## Problem Diagnosis

The Accounts dashboard cards show ₹0 for most values due to **3 bugs** in the RPC function and **1 bug** in the client-side code:

### Bug 1 — Monthly Expenses RPC query is broken
The `get_accounts_dashboard_metrics` RPC uses `amount` (non-existent column) and `entry_date` (non-existent column) instead of `total_amount` and `voucher_date`. It also doesn't filter by `voucher_type = 'expense'`, so it would include receipts/payments if the column existed.

### Bug 2 — Payment card amounts are hardcoded to 0
In `Accounts.tsx` lines 192-198, `paidAmount`, `pendingAmount`, `partialAmount`, `completedAmount` are all set to `0`. The RPC only returns counts per status, not amounts.

### Bug 3 — Total Invoices card uses `totalReceivables` (outstanding) not total sales
`paymentStats.totalAmount` is set to `dashboardStats?.totalReceivables` which is outstanding balance, not total invoice value.

### Bug 4 — P/L formula is wrong
`currentMonthPL` is calculated as `receivables - payables - expenses` which doesn't represent profit/loss. It should be `totalSales - totalPurchases - expenses` for the current month.

---

## Plan

### Step 1 — Fix the RPC function via migration

Update `get_accounts_dashboard_metrics` to:
- Fix monthly expenses: use `total_amount`, `voucher_date`, and filter `voucher_type = 'expense'`
- Add amount aggregations per payment status (paid/partial/pending amounts)
- Add total sales amount for the month
- Add total purchases amount for the month (for proper P/L)
- Return `invoiceStats` with both counts AND amounts

New RPC return shape:
```json
{
  "totalReceivables": 208075,
  "totalPayables": 50000,
  "monthlyExpenses": 15500,
  "monthlySales": 775910,
  "monthlyPurchases": 300000,
  "invoiceStats": {
    "total": 166, "totalAmount": 775910,
    "paid": 100, "paidAmount": 500000,
    "partial": 30, "partialAmount": 175000,
    "pending": 36, "pendingAmount": 100910
  }
}
```

### Step 2 — Fix client-side mapping in Accounts.tsx

Update `paymentStats` to use the new RPC amounts:
- `totalAmount` → `invoiceStats.totalAmount`
- `completedAmount` → `invoiceStats.paidAmount`
- `partialAmount` → `invoiceStats.partialAmount`
- `pendingAmount` → `invoiceStats.pendingAmount`

Update `dashboardMetrics`:
- `currentMonthPL` → `monthlySales - monthlyPurchases - monthlyExpenses`
- `totalReceivables` → from RPC (outstanding from customers)
- `totalPayables` → from RPC (outstanding to suppliers)

### Files Changed
1. **New migration SQL** — rewrite `get_accounts_dashboard_metrics` RPC
2. **`src/pages/Accounts.tsx`** — update lines 180-199 to map new RPC fields

