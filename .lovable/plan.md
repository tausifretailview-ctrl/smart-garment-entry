

## Problem

The Customer Ledger **display** was fixed (subtracting `sale_return_adjust` from `paidAtSale`), but the **balance calculation hook** (`useCustomerBalance.tsx`) still double-counts CN adjustments. This is why the summary card shows ₹3,950 Advance when it should be ₹0.

For Ashifa Hussain:
- `totalPaid` includes 3,950 for INV/823 (from `paid_amount` set by CN adjustment)
- `saleReturnTotal` includes the full 6,500 sale return
- The 3,950 CN portion is subtracted **twice**: once in `totalPaid` and once in `saleReturnTotal`
- Result: balance = 0 + 13400 - 10850 - 6500 = **-3950** (wrongly showing advance)

## Fix — Two changes in `src/hooks/useCustomerBalance.tsx`

**Change 1** — Add `sale_return_adjust` to the sales query (line 45):
```
.select('id, net_amount, paid_amount, sale_return_adjust')
```

**Change 2** — Subtract `sale_return_adjust` from `salePaidAmount` before adding to `totalPaidOnSales` (lines 82-88):
```typescript
sales?.forEach(sale => {
  const salePaidAmount = sale.paid_amount || 0;
  const cnAdjusted = sale.sale_return_adjust || 0;
  const voucherAmount = invoiceVoucherPayments[sale.id] || 0;
  // Subtract CN adjustment from paid_amount to avoid double-counting with saleReturnTotal
  totalPaidOnSales += voucherAmount > 0 ? voucherAmount : (salePaidAmount - cnAdjusted);
});
```

This ensures the CN-adjusted amount is only counted once (via `saleReturnTotal`), not also in `totalPaid`.

**Also update `src/utils/customerBalanceUtils.ts`** — same fix in `calculateCustomerBalance` for consistency, subtracting any CN adjustment from the `salePaidAmount` fallback path.

No database changes needed. Single-concept fix across 2 files.

