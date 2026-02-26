
# Fix Stock Report Purchase/Sales Qty Discrepancy

## Problem
The Stock Report shows Purchase Qty: +34 and Sales Qty: -21 for PUL175, while Product History correctly shows 467 purchased and 223 sold. The numbers don't match because Stock Report uses the `stock_movements` table (which may have incomplete records for older transactions) instead of querying the actual transaction tables directly.

## Root Cause
- **Product History**: Queries `purchase_items` and `sale_items` tables directly by `product_id` -- accurate source of truth
- **Stock Report**: Queries `stock_movements` table by `variant_id` -- may be missing movements for transactions created before the movement tracking was added, or may be affected by the 1000-row default query limit

## Solution
Replace the `stock_movements`-based calculation in the Stock Report with direct queries to `purchase_items`, `sale_items`, `sale_return_items`, and `purchase_return_items` tables, matching the approach used by Product History.

## Technical Changes

### File: `src/pages/StockReport.tsx`

**Replace the stock_movements query block (lines 396-476)** with direct queries to transaction item tables:

1. **Remove** the `stock_movements` fetch (batched by variant IDs)
2. **Add** batched queries to:
   - `purchase_items` -- aggregate `qty` grouped by `sku_id` (variant_id)
   - `sale_items` -- aggregate `quantity` grouped by `variant_id`
   - `sale_return_items` -- aggregate `quantity` grouped by `variant_id` (for purchase return qty, already captured in current stock)
   - `purchase_return_items` -- aggregate `qty` grouped by `variant_id`
3. **Build** the same `variantMovements` map from direct data:
   ```
   purchase = SUM(purchase_items.qty) for each variant
   sales = SUM(sale_items.quantity) for each variant
   purchaseReturn = SUM(purchase_return_items.qty) for each variant
   ```
4. Keep the same batching approach (200 IDs per batch) to avoid query limits
5. Each batch query uses no `.limit()` override -- instead, paginate within each batch if needed (fetch in 1000-row pages)

This ensures the Stock Report shows the same accurate numbers as Product History, regardless of whether stock_movements has complete data.

## Impact
- Only `src/pages/StockReport.tsx` is modified
- No database changes needed
- The existing `batch_stock` query for supplier info remains unchanged
- Current stock (`stock_qty`) from `product_variants` is unaffected -- it's already correct via database triggers
