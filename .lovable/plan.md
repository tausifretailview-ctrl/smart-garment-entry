

## Add Delete and Reverse Actions to Balance Adjustment History

### Problem
When an incorrect balance adjustment is made, there's no way to fix it from the UI. Currently it requires manual database intervention.

### Solution
Add two action buttons (Delete and Reverse) to each row in the "Recent Adjustments" history table within the Customer Balance Adjustment dialog.

### How It Works

**Delete**: Removes the adjustment record from the database AND reverses its financial effects (restores opening_balance, removes/restores advance entries). The entry disappears completely from the ledger.

**Reverse**: Creates a new counter-adjustment entry with opposite values (e.g., if original was -202,500 outstanding, reverse creates +202,500). Both entries remain visible in the audit trail for accountability.

### Technical Details

**File: `src/components/CustomerBalanceAdjustmentDialog.tsx`**

1. Add an "Actions" column to the adjustment history table header
2. Add Delete and Reverse icon buttons to each history row
3. Add a confirmation dialog (AlertDialog) before executing either action

**Delete mutation logic:**
- Remove the adjustment record from `customer_balance_adjustments`
- Reverse the `opening_balance` change on the customer (subtract the `outstanding_difference`)
- If `advance_difference > 0`: find and delete the advance entry created by this adjustment
- If `advance_difference < 0`: restore the used amounts on advances (reverse FIFO deductions)
- Invalidate all related query caches

**Reverse mutation logic:**
- Insert a new `customer_balance_adjustments` record with negated differences
- Apply the reverse outstanding change to `opening_balance`
- Apply the reverse advance change (create/reduce advances as needed)
- Set reason as "Reversal of: [original reason]"
- Invalidate all related query caches

**UI additions:**
- Import `Trash2`, `Undo2` icons from lucide-react
- Import `AlertDialog` components for confirmation
- Add state for tracking which adjustment is being acted on and which action type
- Confirmation dialog shows the adjustment details and asks to confirm delete or reverse

