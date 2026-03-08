
## Fix FIFO Restore Loop Bug in 3 Trigger Functions

### Problem
All three stock-restore trigger functions have the same bug in their FIFO batch loop. They use the item's total quantity instead of the current batch's quantity in the `LEAST()` call:

- `handle_sale_item_delete`: `LEAST(v_remaining_qty, OLD.quantity)` — `OLD.quantity` equals `v_remaining_qty` initially, so every batch gets the full amount restored, creating an infinite loop
- `restore_stock_on_sale_return`: `LEAST(v_remaining_qty, NEW.quantity)` — same issue
- `handle_purchase_return_item_delete`: `LEAST(v_remaining_qty, OLD.qty)` — same issue

### Fix
One migration replacing all three functions, changing the second argument of `LEAST()` to `v_batch.quantity` in each:

```sql
v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
```

### Migration SQL
A single `CREATE OR REPLACE FUNCTION` statement for each of the three functions, using the user's provided SQL plus completing the two functions that were described as comments. No schema changes — only function body replacements.

### Files Changed
- **Database migration only** — no application code changes needed
