

# Comprehensive Fix: Customer Balance Consistency Across All Organizations

## Summary

The multi-invoice payment fix is now deployed and working correctly in `Accounts.tsx`. However, I've identified **3 additional locations** in the codebase that calculate customer balances **without** the proper `Math.max(paid_amount, voucher_payments)` logic. These need to be updated to ensure consistent balance calculations across all organizations and all customers.

---

## Current Status

### Already Fixed
- **`src/pages/Accounts.tsx`** (voucher creation) - Creates separate vouchers per invoice
- **`src/hooks/useCustomerBalance.tsx`** - Uses `Math.max()` logic correctly
- **`src/components/CustomerLedger.tsx`** - Uses `Math.max()` logic correctly  
- **`src/hooks/useCustomerSearch.tsx`** - Uses `Math.max()` logic correctly
- **`src/pages/salesman/SalesmanOutstanding.tsx`** - Uses `Math.max()` logic correctly
- **`src/pages/salesman/SalesmanCustomerAccount.tsx`** - Uses `Math.max()` logic correctly

### Needs Fixing (Inconsistent Balance Calculation)

| File | Issue | Impact |
|------|-------|--------|
| `src/pages/salesman/SalesmanCustomers.tsx` | Uses `paid_amount` only, doesn't check voucher payments | Salesman customer list shows wrong balance |
| `src/pages/POSDashboard.tsx` | Uses `paid_amount` only for WhatsApp balance | WhatsApp messages show wrong balance |
| `src/pages/Accounts.tsx` (customer dropdown) | Uses `paid_amount` only for filtering | Customer dropdown may hide valid customers |

---

## Technical Details

### Problem Pattern

```typescript
// WRONG: Only counts paid_amount, ignores voucher payments
customerBalances[sale.customer_id].totalPaid += sale.paid_amount || 0;

// WRONG: Adds both, causing double-counting
totalPaid = totalPaidOnBills + voucherPaymentTotal;
```

### Correct Pattern

```typescript
// CORRECT: Use MAX to handle both scenarios
// - Old data: paid_amount may not include voucher payments
// - New data: paid_amount is properly updated
const salePaidAmount = sale.paid_amount || 0;
const voucherAmount = invoiceVoucherPayments.get(sale.id) || 0;
totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
```

---

## Implementation Plan

### File 1: `src/pages/salesman/SalesmanCustomers.tsx`

**Current Code (lines 56-92):**
```typescript
// Only fetches sales, doesn't fetch voucher payments
const { data: salesData } = await supabase
  .from("sales")
  .select("customer_id, net_amount, paid_amount, sale_date")
  ...

// Simply adds paid_amount
customerBalances[sale.customer_id].totalPaid += sale.paid_amount || 0;
```

**Fix:**
1. Fetch voucher payments from `voucher_entries`
2. Build `invoiceVoucherPayments` map
3. Use `Math.max(salePaidAmount, voucherAmount)` for each sale

### File 2: `src/pages/POSDashboard.tsx`

**Current Code (lines 577-596):**
```typescript
// Only sums paid_amount from sales
const totalPaid = sales?.reduce((sum, s) => sum + (s.paid_amount || 0), 0) || 0;
customerBalance = openingBalance + totalSales - totalPaid;
```

**Fix:**
1. Fetch voucher payments for the customer's sales
2. Use `Math.max()` logic for proper balance calculation
3. OR simply use the `useCustomerBalance` hook which already has correct logic

### File 3: `src/pages/Accounts.tsx` (Customer Dropdown Filter)

**Current Code (lines 319-330):**
```typescript
// Uses paid_amount directly without checking vouchers
customerBalances.forEach((sale: any) => {
  const outstanding = Math.max(0, (sale.net_amount || 0) - (sale.paid_amount || 0));
  ...
});
```

**Fix:**
1. Also fetch voucher payments for each sale
2. Use `Math.max(salePaidAmount, voucherAmount)` to calculate outstanding per sale

---

## Recommended Approach: Extract Shared Utility

Since this balance calculation logic is repeated in 6+ places, I recommend extracting it to a reusable utility function:

```typescript
// src/utils/customerBalanceUtils.ts

export interface CustomerBalanceData {
  balance: number;
  totalSales: number;
  totalPaid: number;
}

/**
 * Calculate customer balance from sales and voucher data
 * Uses Math.max() to handle both old and new payment data
 */
export function calculateCustomerBalance(
  customerId: string,
  openingBalance: number,
  sales: Array<{ id: string; net_amount: number; paid_amount: number }>,
  voucherPayments: Map<string, number>,  // sale_id -> amount
  openingBalancePayments: number = 0
): CustomerBalanceData {
  let totalSales = 0;
  let totalPaidOnSales = 0;

  sales.forEach(sale => {
    totalSales += sale.net_amount || 0;
    const salePaidAmount = sale.paid_amount || 0;
    const voucherAmount = voucherPayments.get(sale.id) || 0;
    totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
  });

  const totalPaid = totalPaidOnSales + openingBalancePayments;
  const balance = Math.round(openingBalance + totalSales - totalPaid);

  return { balance, totalSales: Math.round(totalSales), totalPaid: Math.round(totalPaid) };
}
```

This utility can then be used across all files, ensuring consistency.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/utils/customerBalanceUtils.ts` | **NEW** - Create shared utility function |
| `src/pages/salesman/SalesmanCustomers.tsx` | Add voucher fetching + use utility |
| `src/pages/POSDashboard.tsx` | Use `useCustomerBalance` hook or utility |
| `src/pages/Accounts.tsx` | Add voucher fetching for customer dropdown |

---

## Verification After Implementation

Run these checks after changes:
1. SalesmanCustomers page shows same balance as CustomerLedger
2. POSDashboard WhatsApp shows same balance as Accounts page
3. Accounts customer dropdown shows all customers with actual outstanding

---

## Note on Supplier Ledger

The `SupplierLedger.tsx` uses `totalPaidOnBills + voucherPaymentTotal` (adding both). This is actually **correct for suppliers** because:
- Supplier vouchers reference the `supplier_id` directly, not individual bill IDs
- `paid_amount` on bills tracks at-purchase payments only
- Voucher payments are additional payments, not overlapping

Customer payments work differently (vouchers reference the sale_id), which is why they need `Math.max()` logic.

