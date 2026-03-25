

## POS Screen — Footer Alignment & Visual Fixes

### Issues Identified

1. **Barcode font invisible**: Currently `text-xs font-mono text-muted-foreground` — too small and too faint
2. **Disc% column too narrow**: 65px makes input cramped
3. **Footer totals not aligned with table columns**: Footer uses a dynamic `grid-cols-N` layout that doesn't match the table's `gridTemplateColumns`, so Qty total floats left while Net Amount is far from its column

### Plan

**File: `src/pages/POSSales.tsx`**

#### 1. Fix Barcode Font Visibility
- Change barcode text from `text-xs font-mono text-muted-foreground` to `text-sm font-mono text-foreground/80`
- Applies to data rows (line ~3575)

#### 2. Widen Disc% Column
- Increase Disc% from `65px` to `80px` in the `gridTemplateColumns` string
- Update all 4 grid template locations (header, empty rows, data rows, and any other instances)
- New column template: `'50px 130px 1fr 70px 65px 95px 65px 80px 75px 95px 120px'`

#### 3. Align Footer with Table Columns
- Replace the current dynamic `grid-cols-N` layout with a **matching `gridTemplateColumns`** that mirrors the table grid
- The footer bar will use the same column structure as the table, placing:
  - **Qty total** → under the Qty column
  - **Discount total** → spanning the Disc%/DiscRs area
  - **Net Amount box** → under the Net Amount column (right-aligned)
- The first few columns (Sr, Barcode, Product) will be merged to hold: Quantity count, Customer Saves badge, Add Charges, and Discount
- The remaining columns (Size, Qty, MRP, Tax, Disc%, DiscRs, UnitPrice, NetAmount) will hold: Flat Discount, S/R Adjust, Round Off, and the Net Amount box aligned to the right edge
- This ensures the footer's right edge (Net Amount) sits exactly below the table's Net Amount column

#### Technical Approach
- Use the same `gridTemplateColumns` as the table but with `left-[72px]` offset preserved
- Group the left-side footer items (Qty, Saves, Charges, Discount) into the merged Product column area
- Place Flat Discount, S/R Adjust, Round Off in the middle columns
- Place Net Amount box in the last column, right-aligned

No logic, functionality, or button behavior changes — purely CSS/layout alignment.

