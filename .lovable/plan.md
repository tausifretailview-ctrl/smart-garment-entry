

## Add Bulk "Adjust Advance" Feature to Sales Invoice Dashboard

### Problem
Customer Khadija Sheikh has ₹4,000 advance balance, but outstanding invoices still show as Partial/Not Paid. Currently the only way to apply advances is one invoice at a time via the payment dialog. The user wants a one-click bulk adjustment option.

### Changes — Single file: `src/pages/SalesInvoiceDashboard.tsx`

**1. Add "Adjust Advance" button in the dashboard toolbar area**
- When a customer search filter is active and the filtered customer has an available advance balance, show an "Adjust Advance (₹X)" button
- Button appears near the filter/search area at the top

**2. Bulk Adjust Advance Dialog**
- New dialog that shows:
  - Customer name and available advance balance
  - List of outstanding invoices (pending/partial) for that customer, sorted oldest first
  - Auto-calculated allocation (FIFO): how much of the advance will be applied to each invoice
  - Confirm button to execute
- On confirm:
  - Loop through invoices in date order, apply advance amount (FIFO) to each
  - Update `paid_amount` and `payment_status` on each invoice
  - Call `applyAdvance.mutateAsync()` to deduct from `customer_advances` table
  - Create voucher entries for each adjustment
  - Refresh queries

**3. Keep existing manual per-invoice "From Advance" option**
- No changes needed — it already works correctly

### Technical Flow

```text
User clicks "Adjust Advance ₹4,000"
  → Dialog shows outstanding invoices:
     INV/1194: ₹10,200 pending → apply ₹4,000 (partial) 
     Remaining advance: ₹0
  → User confirms
  → System updates:
     - INV/1194: paid_amount += 4000, status recalculated
     - customer_advances: used_amount += 4000 (FIFO)
     - voucher_entry created for each allocation
  → Dashboard refreshes with updated balances/statuses
```

### State additions
- `showBulkAdvanceDialog` boolean
- `bulkAdvanceCustomerId` / `bulkAdvanceCustomerName` 
- `bulkAdvanceBalance` number
- `bulkAdvanceInvoices` array (fetched on dialog open)
- `isProcessingBulkAdvance` boolean

