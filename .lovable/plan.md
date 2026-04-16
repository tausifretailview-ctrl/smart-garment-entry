

## Fix: Add `purchase_edit` to stock_movements check constraint

### Root Cause
The `handle_purchase_item_update` trigger (from a recent migration) inserts a stock movement with `movement_type = 'purchase_edit'`, but the `stock_movements_movement_type_check` constraint doesn't include `'purchase_edit'` as a valid value.

### Fix
One database migration to:
1. Drop the existing `stock_movements_movement_type_check` constraint
2. Recreate it with `'purchase_edit'` added to the allowed values list

### Files
- New migration SQL only — no application code changes needed.

