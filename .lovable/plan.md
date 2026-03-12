

## Problem

For customer ASHIFA HUSSAIN, invoice INV/25-26/823 (₹3,950) had a Credit Note adjusted against it. The CN adjustment correctly updated `paid_amount` to 3,950 and `sale_return_adjust` to 3,950. However, the Customer Ledger doesn't account for `sale_return_adjust` — it sees `paid_amount = 3,950` with no voucher payments and incorrectly shows "Payment at sale ₹3,950".

The sale return itself is already shown as a credit entry in the ledger (via `cn_adjustment` type), so the "Payment at sale" entry causes **double-counting**, making the balance appear lower than it should.

## Fix

**File: `src/components/CustomerLedger.tsx`** (around lines 796-827)

In the transaction-building logic, subtract `sale_return_adjust` from the "payment at sale" calculation:

```
// Current (wrong):
const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);

// Fixed:
const saleReturnAdjust = sale.sale_return_adjust || 0;
const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments - saleReturnAdjust);
```

This ensures CN-adjusted amounts are not double-counted as both a "Sale Return" credit and a "Payment at sale" credit.

Additionally, the sales query (line 513) needs to include `sale_return_adjust` in the select:
```
.select("*, created_at")  // already selects all columns via *, so no change needed
```

Since `select("*")` is already used, the column is already fetched. Only the calculation logic needs updating.

## Impact
- Fixes the balance mismatch for ASHIFA HUSSAIN and any other customer where CN was adjusted against an invoice
- No database changes needed
- Single file change in `CustomerLedger.tsx`

