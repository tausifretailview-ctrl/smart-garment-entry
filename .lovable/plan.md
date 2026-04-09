

# Fix: Double-Deduction of Sale Return Adjustment in Customer Ledger

## Problem
When POS saves an exchange (return ₹1,895, buy ₹2,895, pay ₹1,000), `net_amount` is saved as ₹1,000 (already deducted SR). But the sale return also appears as a separate ₹1,895 credit entry in the ledger — deducting it twice, producing a false ₹895 credit balance instead of ₹0.

## Fix (all in `src/components/CustomerLedger.tsx`)

### Change 1: Ledger invoice debit → show gross amount (line ~862-888)
Use `net_amount + sale_return_adjust` as the debit so the SR credit entry balances correctly.

```typescript
const saleReturnAdjust = sale.sale_return_adjust || 0;
const grossInvoiceAmount = sale.net_amount + saleReturnAdjust;

if (!isCancelled) {
  runningBalance += grossInvoiceAmount;
}
// ...
debit: isCancelled ? 0 : grossInvoiceAmount,
description: `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${sale.payment_status}${saleReturnAdjust > 0 ? ` (Incl. SR Adj ₹${saleReturnAdjust.toLocaleString('en-IN')})` : ''}`,
```

### Change 2: Summary `totalSales` → use gross amounts (line ~359)
```typescript
const totalSales = customerSales.reduce((sum: number, s: any) => 
  sum + (s.net_amount || 0) + (s.sale_return_adjust || 0), 0);
```

### Change 3: Summary `totalPaid` → stop subtracting SR adjust (line ~368)
```typescript
const actualPaid = Math.max(salePaidAmount, voucherAmount);
```
Remove the `- saleReturnAdjust` since SR is now in `totalSales` (gross) and subtracted once via `creditNoteTotal`.

### What won't change
- How POS saves `net_amount` (correct as-is)
- Sale return triggers/stock logic
- Voucher creation flow
- Other pages (SalesInvoiceDashboard, Accounts tabs)

