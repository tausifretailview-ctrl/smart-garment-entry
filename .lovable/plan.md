
<final-text>Based on the current code, the issue is in the POS sale-return flow, not the dashboard delete itself.

What is happening:
- Deleting a sale return from the Sale Return Dashboard does reverse stock once through the backend `soft_delete_sale_return(...)` function.
- Permanent delete from Recycle Bin should not reverse stock again, because the child return-items are already soft-deleted and the delete trigger skips them.
- The real bug is that POS floating sale return adds stock twice:
  1. once by the database trigger on `sale_return_items`
  2. again manually in `src/components/FloatingSaleReturn.tsx`

So the sequence becomes:
```text
Create POS sale return  -> stock +1 by DB trigger, +1 again by frontend
Delete from dashboard   -> stock -1 by backend soft delete
Net result              -> stock still +1 extra
Next sale return        -> stock ceiling trigger blocks save
```

That is why after deleting the ₹699 return, making the same S/R adjust again can fail.

The exact backend error to surface is the stock ceiling error from `check_stock_ceiling_on_sale_return()`, which is currently hidden too often by generic toast text.</final-text>

Implementation plan

1. Fix the root cause in POS only
- Remove the manual `product_variants.stock_qty` increment from `src/components/FloatingSaleReturn.tsx`
- Rely only on the database trigger for sale return stock restoration
- Keep standalone `SaleReturnEntry.tsx` unchanged for stock logic, since it does not have this double-add bug

2. Repair the current Velvet organization data
- Trace the deleted ₹699 return and its affected variant(s)
- Verify current stock vs authoritative stock formula
- Correct the extra stock left behind from the double-add so the next return can save normally

3. Show the exact error instead of generic “Failed to save sale return”
- Update `FloatingSaleReturn.tsx` and `SaleReturnEntry.tsx`
- Normalize backend errors and display `message/details/hint` when available
- So users see the real reason, such as:
```text
Stock ceiling exceeded for variant ...
Current: ...
Adding: ...
Max allowed: ...
```

4. Fix the misleading delete message in Sale Return Dashboard
- `src/pages/SaleReturnDashboard.tsx` currently says:
  - “permanently delete”
  - “Stock will NOT be automatically adjusted”
- Change this copy to match actual behavior:
  - dashboard delete = move to recycle bin
  - stock is reversed at that stage
  - permanent delete later should not adjust stock again

5. Verify end-to-end
- Create POS sale return
- Delete it from Sale Return Dashboard
- Permanently delete it from Recycle Bin
- Create the same return again in POS
- Confirm:
  - save succeeds
  - exact error shows if blocked
  - stock matches expected value
  - no leftover extra S/R adjust behavior

Technical details

- Dashboard delete path:
  - `src/pages/SaleReturnDashboard.tsx`
  - `useSoftDelete().softDelete("sale_returns", id)`
  - backend `soft_delete_sale_return(...)`
- Problematic create path:
  - `src/components/FloatingSaleReturn.tsx`
  - inserts `sale_return_items` and then manually updates `product_variants.stock_qty` again
- Backend trigger already handling stock:
  - `restore_stock_on_sale_return()`
- Backend blocker that user should see clearly:
  - `check_stock_ceiling_on_sale_return()`
- Permanent delete behavior:
  - `src/hooks/useSoftDelete.tsx` hard-deletes `sale_return_items`
  - delete trigger skips rows where `OLD.deleted_at IS NOT NULL`, so stock should not move a second time
