

## Plan: Fix Sale Return Stock Drift Bug

### Problem
Barcode 150006822 shows stock_qty = 12 but the correct value is 10 (Purchase 10 - Sale 1 + Active Return 1 = 10). The `batch_stock` table is correct at 10, but `product_variants.stock_qty` has drifted by +2.

### Root Cause
The Sale Return edit flow in `SaleReturnEntry.tsx` deletes old `sale_return_items` and inserts new ones. This fires two database triggers:
1. `handle_sale_return_item_delete` — deducts stock
2. `restore_stock_on_sale_return` — adds stock

While these should net to zero, there's a subtle inconsistency: the delete trigger only deducts from `batch_stock` where `quantity > 0`, but the insert trigger always adds to `stock_qty` first. If any timing or transaction issue occurs, `stock_qty` can drift from `batch_stock`.

### Changes

**1. Fix the immediate data — Database Migration**
- Correct the `stock_qty` for variant `9d41a175-6eff-4319-af73-342181622d39` from 12 to 10.
- Add a `stock_movement` record documenting this correction.

**2. Fix Sale Return Edit flow — `SaleReturnEntry.tsx`**
- Before deleting old items in edit mode, soft-delete them first (set `deleted_at`) so the `handle_sale_return_item_delete` trigger SKIPS stock adjustment (it already checks `IF OLD.deleted_at IS NOT NULL THEN RETURN OLD`).
- Then hard-delete them (trigger skips, no stock change).
- New items are inserted as before (INSERT trigger adds stock normally).
- This ensures stock is only adjusted ONCE per edit (via the INSERT trigger), not twice (DELETE deduction + INSERT addition).

**3. Add a stock reconciliation safety net — Database Migration**
- Create a `reconcile_variant_stock_qty` RPC that recalculates `stock_qty` from: `opening_qty + SUM(batch_stock.quantity) - active_sale_items_qty + active_return_items_qty` for any given variant, and updates if there's a mismatch. This gives users a way to fix future drift.

### Technical Details

**File: `src/pages/SaleReturnEntry.tsx` (edit mode, ~line 686)**
```
Current: DELETE items → INSERT items (both triggers fire)
Fixed:   UPDATE items SET deleted_at=now() → DELETE items (trigger skips) → INSERT items (trigger fires once)
```

**Migration SQL (data fix)**
```sql
UPDATE product_variants SET stock_qty = 10 WHERE id = '9d41a175-...';
INSERT INTO stock_movements (...) VALUES (..., 'adjustment', -2, ..., 'Stock reconciliation correction');
```

