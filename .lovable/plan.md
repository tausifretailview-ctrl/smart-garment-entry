

## Fix: Apply CN ₹1,000 to INV/1013 + Add "Credit Note" Payment Mode

### Part A — Immediate Data Fix (SQL)

Update INV/25-26/1013 for Reshma Leela to apply ₹950 from the remaining CN balance (SR/53), fully settling the invoice. Run via database tool:

```sql
UPDATE sales
SET paid_amount = net_amount,
    payment_status = 'completed',
    sale_return_adjust = COALESCE(sale_return_adjust, 0) + 950
WHERE sale_number = 'INV/25-26/1013'
  AND organization_id = (SELECT id FROM organizations WHERE name ILIKE '%ella noor%' LIMIT 1);
```

### Part B — Add "Credit Note" Payment Mode

**File: `src/pages/SalesInvoiceDashboard.tsx`** — 5 targeted changes:

1. **New state variables** (after line 166):
   - `availableCNBalance`, `isFetchingCN`, `selectedCNReturnId`

2. **Reset CN state** in `openPaymentDialog` (line 1259 area):
   - Reset the 3 new CN state vars

3. **Fetch CN balance** in `handlePaymentModeChange` (after line 1279):
   - When mode is `credit_note`, query `sale_returns` for this customer with `credit_status` in `['pending', 'adjusted']`
   - Calculate available balance, auto-fill pending amount

4. **Handle CN in `handleRecordPayment`** (after line 1332):
   - Update `sale_returns` record: set `credit_status = 'adjusted'`, `linked_sale_id` to this invoice
   - Update `sales.sale_return_adjust` on the invoice
   - Update voucher description for credit note mode

5. **UI changes** in the payment dialog (lines 2570-2620):
   - Add `<SelectItem value="credit_note">From Credit Note (CN)</SelectItem>` dropdown option
   - Add CN balance display badge (mirroring advance balance display)
   - Update disabled condition on Record Payment button

No other files or DB schema changes needed.

