

## Add Sale Return Tracking to Stock Analysis

### Changes in `src/pages/StockAnalysis.tsx`

**1. Interface** (line 22): Add `sale_return_qty: number` after `sales_qty`

**2. variantMovements reduce block** (lines 162-184): Replace entire block with the user's expanded version that handles `saleReturn` and additional movement types (`restore_purchase`, `challan`, `sale_return`, etc.)

**3. formattedData mapping** (line 187): Update default to include `saleReturn: 0`, add `sale_return_qty: Math.max(0, movements.saleReturn || 0)` after `sales_qty` (line 201)

**4. Low Stock table** (lines 478-529):
- Add `<TableHead>` for "Sale Return" after "Sales Qty" (line 483) with emerald styling
- Add `<TableCell>` in body row after sales cell (line 503) showing `+{item.sale_return_qty}` when > 0
- Add sale return total cell in totals row (after line 521)
- Update colSpan from 5 to match

**5. Any other table sections** displaying the same columns — check and add consistently.

