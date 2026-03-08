

## Add Sale Return Qty Column to Stock Report

### Changes in `src/pages/StockReport.tsx`

1. **StockItem interface** (line 32): Add `sale_return_qty: number` field after `sales_qty`

2. **fetchSaleReturnItems helper** (after line 521): Add paginated fetch function for `sale_return_items` table, querying `variant_id, quantity` filtered by `deleted_at IS NULL`

3. **variantMovements type** (line 524): Add `saleReturn: 0` to the init shape

4. **Promise.all** (line 533): Add `fetchSaleReturnItems(batchIds)` as 4th parallel call, destructure as `saleReturnRows`

5. **Accumulation loop** (after line 558): Add loop over `saleReturnRows` accumulating `saleReturn` by `variant_id`

6. **All variantMovements init objects** (lines 548, 552, 556, and new loop): Include `saleReturn: 0`

7. **formattedData mapping** (after line 587): Add `sale_return_qty: Math.max(0, movements.saleReturn || 0)`

8. **Table header** (after line 1177 — after "Sales Qty"): Add `<TableHead className="text-right bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-white">Sale Return</TableHead>`

9. **Table body row** (after line 1214 — after sales_qty cell): Add sale return cell with green styling showing `+{item.sale_return_qty}` when > 0

10. **Totals row** (after line 1262 — after sales total): Add sale return total cell

11. **colSpan on "No products found"** (line 1188): Update from 16 to 17

12. **CardDescription formula** (line 1154): Update to include `+ Sale Return`

