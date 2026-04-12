

## Add Delete & Modify Actions to Balance Adjustment History

### Current State
- The **Recent Adjustment History** table (`RecentBalanceAdjustments.tsx`) only allows editing the **reason text** and **printing** a receipt.
- Full **delete** and **reverse** logic already exists inside `CustomerBalanceAdjustmentDialog.tsx` (with proper financial reversal of advance/outstanding effects).
- Users need the ability to delete or fully modify adjustment entries directly from the history table.

### Changes

**File: `src/components/RecentBalanceAdjustments.tsx`**

1. **Add Delete button** — A trash icon button in the Actions column. On click, show a confirmation dialog warning that deleting will reverse the financial effect (outstanding/advance changes). Uses the same `applyAdjustmentEffects` logic from `CustomerBalanceAdjustmentDialog`.

2. **Add Reverse button** — An undo icon button that creates a counter-adjustment record (same as existing reverse logic in the dialog).

3. **Expand Modify dialog** — Currently only edits the reason. Enhance it to also allow editing the outstanding and advance amounts, recalculating differences and applying the financial delta.

4. **Confirmation dialog** — Add a confirmation step for delete/reverse actions showing the customer name and adjustment details before proceeding.

5. **Extract shared helper** — Move the `applyAdjustmentEffects` function to a shared utility (or duplicate the logic inline) so `RecentBalanceAdjustments` can perform delete/reverse without opening the main dialog.

### Technical Details

- Delete: Reverse advance effects (negate `advance_difference`), then delete the `customer_balance_adjustments` row
- Reverse: Insert a new counter-record with negated differences, apply reverse advance effects
- Modify: Calculate delta between old and new values, apply the incremental difference to advances, update the adjustment record
- Invalidate queries: `all-balance-adjustments`, `customer-balance`, `customer-advances` after any mutation
- Permission check: Only users with `modify_records` permission can edit/reverse; only `delete_records` permission can delete

