

## Issues Identified

1. **Column headers not printing** — The header uses `background: gradient` with `color: #fff` (white text). Most browsers strip background colors/images when printing, making white text invisible on white paper.
2. **Total discount missing in footer** — The `tfoot` total row doesn't show the sum of discounts.
3. **SIZE/QTY column too narrow** — Needs more width to display size details properly.

## Fix — `src/components/invoice-templates/ModernWholesaleTemplate.tsx`

### Change 1: Fix header visibility on print
Add `-webkit-print-color-adjust: exact` and `print-color-adjust: exact` to `headerCellStyle` so browsers preserve the gradient background and white text during printing.

### Change 2: Add total discount in footer
In the `tfoot` row (~line 432-446), add the total discount amount in the DISC% column cell (currently just `&nbsp;`). Calculate `totalDiscount` from grouped items.

### Change 3: Increase SIZE/QTY column width
Increase the `<col>` width for SIZE/QTY from `82px` (A5) / `80px` (A4) to `100px` / `100px`.

