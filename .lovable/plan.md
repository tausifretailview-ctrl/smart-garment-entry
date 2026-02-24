

## Fix: Amount Clipping in Invoice Summary Panel

### Problem
In the ModernWholesaleTemplate invoice, the right-side summary panel (Sub Total, Discount, Taxable Amt, CGST, SGST, Grand Total) has a fixed width of 220px. When amounts are large (e.g., amounts in thousands with grouping commas and decimals), the values get cut off and are not fully visible in the printed/PDF invoice.

### Solution
Increase the summary panel width and ensure the amount column has enough space to display full currency values without clipping.

### What Will Change

**File: `src/components/invoice-templates/ModernWholesaleTemplate.tsx`**

1. **Increase summary panel width** from `220px` to `260px` -- this provides enough room for amounts up to lakhs with decimal formatting (e.g., "1,00,000.00")
2. **Add `overflow: visible`** to the summary table cells to prevent any CSS-level clipping
3. **Ensure the amount column (`td` with `textAlign: right`)** has a `minWidth` so currency values always render fully

### Technical Details

- Line 438: Change `width: "220px"` to `width: "260px"` on the summary container
- The `formatCurrency` function already handles proper Indian number formatting with grouping -- the issue is purely a width constraint
- The left side (`flex: 1`) will naturally shrink slightly to accommodate the wider summary panel, which is acceptable since it contains text that can wrap

