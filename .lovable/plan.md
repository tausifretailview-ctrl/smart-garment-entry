

## Fix ASHIFA HUSSAIN Invoice INV/25-26/946 Payment Status

### Problem
From the Customer Ledger, ASHIFA HUSSAIN's account is fully settled (balance ₹0), but invoice **INV/25-26/946** still shows as "Partial" in the Sales Dashboard because:
- `net_amount` = ₹2,950
- `paid_amount` = ₹400 (direct payment via RCP/25-26/1062)
- `sale_return_adjust` = 0 (the ₹2,550 credit from SR/25-26/33 was never formally applied to this invoice)

The credit note from SR/25-26/33 (₹6,500) was partially used against INV/25-26/823 (₹3,950), leaving ₹2,550 which covered the remaining balance on INV/25-26/946. But that adjustment was never recorded on the invoice.

### Fix (Data Update)
Update the `sales` record for INV/25-26/946 (id: `a5fc95cb-04de-4c72-adcd-fe2f41dd4930`):
- Set `paid_amount` = 2950 (400 cash + 2550 CN)
- Set `sale_return_adjust` = 2550
- Set `payment_status` = 'completed'

This is a single data update operation — no code changes needed.

