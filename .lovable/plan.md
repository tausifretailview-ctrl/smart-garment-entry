
This is a research/explanation question, not an implementation task. Let me explain the existing credit note adjustment flow in your ERP.

## How Credit Note Adjustment Works in the Next Invoice

### 1. Credit Note Creation (Source)
A credit note is created in two ways:
- **Sale Return**: When you process a sale return for a customer, a credit note record is created in the `credit_notes` table with `credit_amount` = return value, `used_amount` = 0, `status` = 'active'.
- **Negative POS Bill**: When a POS bill ends with a negative amount (e.g., return ₹390 - new item ₹100 = -₹290), the credit balance is stored against the customer.

The credit note is linked to a `customer_id` — that's why customer name/phone is now mandatory for negative bills (just implemented).

### 2. Available Credit Visibility
When you select a customer in POS or Sales Invoice:
- The system calls `useCreditNotes.getAvailableCreditBalance(customerId)`
- This sums `(credit_amount - used_amount)` from all active credit notes for that customer (FIFO order — oldest first)
- The available credit shows in the bill footer / payment section as "Available Credit: ₹X"

### 3. Adjusting Credit in Next Invoice
In the next sale to the same customer:

**Step A — User Action**: 
- Open the **Adjust Credit Note** dialog (`AdjustCustomerCreditNoteDialog.tsx`) from the bill footer
- System displays all active credit notes for the customer with available balance
- User enters amount to apply (or system auto-suggests up to invoice total)

**Step B — Application Logic** (FIFO):
The `applyCredit(customerId, amountToApply)` function in `useCreditNotes.tsx`:
1. Fetches active credit notes ordered by `created_at ASC` (oldest first)
2. Loops through each note, deducting from `available_balance` until requested amount is satisfied
3. Updates each note's `used_amount` and changes `status`:
   - `used_amount = credit_amount` → `'fully_used'`
   - `used_amount > 0` but `< credit_amount` → `'partially_used'`

**Step C — Invoice Effect**:
- Applied credit reduces the invoice's outstanding amount
- Stored on the sale record (reduces what customer owes)
- Reflected in customer balance via `useCustomerBalance` hook (refundsPaid logic in balance formula)

### 4. Example Flow
```
Customer: RAJESH
Credit Note CN-001: ₹290 (active, used=0)

Next Invoice: ₹500
→ Open Adjust Credit dialog → Apply ₹290
→ CN-001 updated: used_amount=290, status='fully_used'  
→ Invoice net payable: ₹210
→ Customer pays ₹210 cash → settled
```

### 5. Customer Balance Math
The `calculateCustomerBalance` formula already accounts for this:
```
Balance = Opening + Sales - Paid + Adjustments - UnusedAdvances + Refunds
```
- Credit notes that are NOT yet adjusted sit as a negative balance (we owe customer)
- Once adjusted to a new invoice, `used_amount` increases, reducing the available credit, while the invoice payment is satisfied

### Where to Find This in UI
- **Bill Footer**: "Available Credit" badge appears when customer has unused credit
- **Adjust Credit Button**: Opens `AdjustCustomerCreditNoteDialog` showing all available credit notes
- **Customer Ledger**: Shows credit notes issued, used, and remaining balance per note
- **Customer History Dialog**: Audit trail of all credit note movements

No code changes needed — this flow already exists end-to-end. If you want, I can add improvements like auto-applying available credit when a customer is selected, or showing a prominent banner.
