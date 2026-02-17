

## Stock Health Widget + User ID Audit Enhancement

### Phase A: Add `user_id` Column to `stock_movements`

**Database Migration:**

1. Add a nullable `user_id UUID` column to `stock_movements`
2. Update all 20 functions that INSERT into `stock_movements` to include `user_id = auth.uid()`

**Functions to update (adding `user_id` to every INSERT INTO stock_movements):**

Trigger functions (12):
- `update_stock_on_purchase()`
- `handle_purchase_item_update()`
- `handle_purchase_item_delete()`
- `update_stock_on_sale()`
- `handle_sale_item_update()`
- `handle_sale_item_delete()`
- `restore_stock_on_sale_return()`
- `handle_sale_return_item_delete()`
- `deduct_stock_on_purchase_return()`
- `handle_purchase_return_item_delete()`
- `update_stock_on_challan()`
- `handle_challan_item_delete()`

Soft-delete/restore functions (8):
- `soft_delete_sale()`
- `restore_sale()`
- `soft_delete_purchase_bill()`
- `restore_purchase_bill()`
- `soft_delete_sale_return()`
- `restore_sale_return()`
- `soft_delete_purchase_return()`
- `restore_purchase_return()`

Reconciliation functions (2):
- `fix_stock_discrepancies()`
- `reset_stock_from_transactions()` (if it inserts movements)

**Risk:** Very low. Adding a nullable column is non-breaking. `auth.uid()` returns NULL in non-authenticated contexts (like background jobs), which is acceptable since the column is nullable. All existing data keeps `user_id = NULL`.

---

### Phase B: Stock Health Summary Widget

Add a summary section at the top of the Stock Reconciliation card that loads on mount and shows:

- **Total Variants** -- count of active product variants
- **Discrepancies** -- count from `detect_stock_discrepancies()` (already exists)
- **Last Reconciliation** -- timestamp of the most recent `movement_type = 'reconciliation'` entry
- **Health Status** -- green checkmark if 0 discrepancies, yellow warning if any exist

This auto-loads when the component mounts, giving admins an instant health overview without needing to click "Scan."

---

### Technical Details

**Migration SQL will:**
1. `ALTER TABLE stock_movements ADD COLUMN user_id UUID;`
2. Re-create all 20 functions with `user_id` added to every `INSERT INTO stock_movements` statement
3. Each INSERT gets `, user_id` in the column list and `, auth.uid()` in the VALUES

**UI changes in `src/components/StockReconciliation.tsx`:**
1. Add `useEffect` to fetch health summary on mount
2. Query total variant count, discrepancy count, and last reconciliation timestamp
3. Render 3 stat cards above the existing action buttons

### Files to Modify

| File | Change |
|------|--------|
| `supabase/migrations/` | New migration: add `user_id` column + update all 20 functions |
| `src/components/StockReconciliation.tsx` | Add stock health summary widget with auto-load |

