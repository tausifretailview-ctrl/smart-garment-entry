

## Fix: Reassign Opening Balance Payment to Invoice

### Problem
A payment was accidentally collected without selecting an invoice number, so it was saved as an "Opening Balance Payment" (`reference_type='customer'`). The actual invoice still shows "Not Paid" (pending), and the payment amount sits against the opening balance instead.

### Solution
Add a **"Reassign to Invoice"** button on opening balance payment rows in the Customer Payment tab. When clicked, it shows the customer's pending invoices and lets you pick which invoice(s) to apply the payment to. The system then:
1. Updates the voucher's `reference_type` from `customer` to `sale` and sets the `reference_id` to the selected invoice
2. Updates the invoice's `paid_amount` and `payment_status` accordingly

### Steps

**1. Add "Reassign" button to opening balance payment rows**
- In the payment history table within `CustomerPaymentTab.tsx`, add a small "Link to Invoice" button next to existing Edit/Delete buttons, visible only for payments with `reference_type='customer'`

**2. Create a Reassign Dialog**
- A dialog that shows the customer's pending/partial invoices
- User selects the invoice to apply the payment to
- On confirm:
  - Update `voucher_entries` row: set `reference_type='sale'`, `reference_id=invoice.id`, update description
  - Update `sales` row: increase `paid_amount`, recalculate `payment_status` (pending/partial/completed)
  - Invalidate relevant queries to refresh the UI

**3. Handle edge cases**
- If payment amount exceeds invoice outstanding, apply what fits and keep remainder as opening balance (or warn user)
- Prevent reassigning to an already fully paid invoice

### Technical Details

**File: `src/components/accounts/CustomerPaymentTab.tsx`**
- Add a `reassignPayment` mutation that:
  1. Fetches the target invoice's current `paid_amount` and `net_amount`
  2. Calculates new `paid_amount` and `payment_status`
  3. Updates the `sales` record
  4. Updates the `voucher_entries` record with `reference_type='sale'` and `reference_id=invoiceId`
  5. Invalidates all related queries
- Add a small dialog/popover for invoice selection when the reassign button is clicked
- Filter invoices to show only `pending` or `partial` status for the same customer

### Files to Modify
- `src/components/accounts/CustomerPaymentTab.tsx` - Add reassign button, dialog, and mutation logic

