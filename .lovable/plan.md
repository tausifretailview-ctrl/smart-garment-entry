

## Add "From Advance" Payment Mode in Record Payment Dialog

### What Changes

When recording a payment for an invoice on the Sales Invoice Dashboard, a new **"From Advance"** option will be added to the Payment Mode dropdown. Selecting it will:

1. Automatically fetch the customer's available advance balance
2. Display the available advance amount in the dialog
3. Auto-fill the payment amount with the lesser of (advance balance, pending amount)
4. On submission, deduct the advance using FIFO logic and update the invoice as paid/partial

### Technical Details

**File: `src/pages/SalesInvoiceDashboard.tsx`**

1. **Import** `useCustomerAdvances` hook (already exists at `src/hooks/useCustomerAdvances.tsx`)

2. **In `openPaymentDialog`**: Reset advance-related state

3. **Add state**: `advanceBalance` to track fetched advance amount

4. **Payment Mode dropdown**: Add `<SelectItem value="advance">From Advance</SelectItem>`

5. **When "advance" is selected**:
   - Fetch customer's available advance balance using `getAvailableAdvanceBalance(customerId)`
   - Display the available advance amount (e.g., "Available Advance: Rs X,XXX")
   - Auto-set payment amount to `Math.min(advanceBalance, pendingAmount)`

6. **In `handleRecordPayment`**:
   - If `paymentMode === "advance"`:
     - Call `applyAdvance.mutateAsync({ customerId, amountToApply: amount })` to deduct from advances using FIFO
     - Update the sales record (paid_amount, payment_status) as usual
     - Create voucher entry with narration "Adjusted from advance balance"
   - Otherwise: existing flow unchanged

7. **UI additions in dialog**:
   - Show an info badge below Payment Mode when "advance" is selected: "Available Advance: Rs X,XXX"
   - If no advance available, show a warning and disable the Record Payment button

### Flow

```text
User clicks "Record Payment" on an invoice
  -> Dialog opens with payment modes (Cash, UPI, Card, Cheque, Bank Transfer, From Advance)
  -> User selects "From Advance"
  -> System fetches customer's advance balance
  -> Shows "Available Advance: Rs 5,000" 
  -> Auto-fills payment amount = min(5000, pending)
  -> User clicks "Record Payment"
  -> System calls applyAdvance (FIFO deduction) + updates invoice paid_amount
  -> Receipt generated with "From Advance" as payment method
```

