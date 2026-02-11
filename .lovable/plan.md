

# Add Advance Amount and Credit Note Pending Cards to Customer History Dialog

## What Changes

Add two new summary cards to the Customer History Dialog showing:
1. **Advance Balance** -- unused advance amount available for the customer
2. **CR Note Pending** -- unused credit note balance pending for the customer

## Technical Details

### File: `src/components/CustomerHistoryDialog.tsx`

1. **Import hooks**: Add `useCustomerAdvanceBalance` from `useCustomerAdvances` and add a query for credit note pending balance.

2. **Add data fetching**:
   - Use `useCustomerAdvanceBalance(customerId, organizationId)` to get the available advance amount
   - Compute credit note pending from the already-fetched `creditNotes` data: sum of `(credit_amount - used_amount)` for active/partially_used notes

3. **Update summary cards grid**: Change from `grid-cols-4` to `grid-cols-6` (or `grid-cols-3 grid-cols-6` responsive) and add two new cards after "Total Paid":

   - **Advance** card (orange border) showing unused advance balance
   - **CR Pending** card (pink/rose border) showing unused credit note balance

4. The layout will be:
   ```
   Opening Balance | Total Sales | Total Paid | Advance | CR Pending | Current Balance
   ```

All values will be fetched from existing hooks/data -- no database changes needed.

