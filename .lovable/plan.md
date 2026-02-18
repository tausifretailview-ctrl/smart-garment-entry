

## Fix Purchase Invoice Product Grid Column Alignment

### Problem
The purchase bill entry table has misaligned columns with equal widths, wrapping item names, and no right-alignment on numeric fields. This doesn't match the expected high-density ERP billing grid style.

### Changes (single file: `src/pages/PurchaseEntry.tsx`)

**1. Update Header Widths**

Apply the exact pixel widths specified:

| Column     | Current        | New     |
|-----------|----------------|---------|
| Checkbox  | 40px           | 40px    |
| SR NO     | 50px           | 60px    |
| ITEM NAME | auto/min-220px | 280px   |
| SIZE      | 90px           | 80px    |
| BARCODE   | 110px          | 130px   |
| QTY       | 120px          | 80px    |
| PUR.RATE  | 150px          | 110px   |
| SALE.RATE | 150px          | 110px   |
| MRP       | 130px          | 100px   |
| GST %     | 120px          | 80px    |
| SUB TOTAL | 110px          | 130px   |
| DISC %    | 80px           | 90px    |
| TOTAL     | 110px          | 130px   |
| Action    | 40px           | 40px    |

**2. Fix Item Name Cell**

Change from `whitespace-normal break-words` to `whitespace-nowrap overflow-hidden text-ellipsis` with a fixed `w-[280px]` and `max-w-[280px]` so text truncates with ellipsis instead of wrapping.

**3. Right-Align Numeric Fields**

Add `text-right` class to header and data cells for: QTY, PUR.RATE, SALE.RATE, MRP, GST %, SUB TOTAL, DISC %, TOTAL. Also add `tabular-nums` to currency display cells for proper digit alignment.

**4. Match Data Row Cell Widths**

Update every `TableCell` width in the data rows to match the corresponding header width exactly.

**5. Update Inline Search Row and Footer Row**

Adjust `colSpan` values in the search row and footer total row to match the new column count and widths.

**6. Update Table Min-Width**

Recalculate `min-w` on the table to match the sum of all column widths (~1360px without MRP, ~1460px with MRP).

### Technical Details

- All edits in `src/pages/PurchaseEntry.tsx` lines ~2470-2820
- Header table and body table both use `table-fixed` layout, so fixed widths will be enforced
- Row height stays at compact ERP standard (h-10 / 40px) via existing classes
- Input fields inside cells keep `w-full` but inherit the tighter column widths
- Numeric inputs get `text-right` class added

