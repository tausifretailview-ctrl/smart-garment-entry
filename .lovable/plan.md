

# Fix: Label Print Alignment for Custom 50x38 1-UP Labels

## Problem
The barcode printing system always uses A4 page settings (`@page { size: A4 }`) and auto-fit scaling designed for A4 sheets, even when printing on thermal printers with small 1-up labels like 50x38mm. This causes:
- Content getting cut off at the top of the first label
- Misalignment between consecutive labels
- Incorrect scaling applied to thermal labels

## Root Cause
Three areas in `src/pages/BarcodePrinting.tsx` are hardcoded to A4:

1. **`@page` CSS rule** (line 4433): Always sets `size: A4`, but for 1-up custom/thermal labels it should be the label size (e.g., `50mm 38mm`)
2. **`getAutoFitScale()`** (line 2608): Calculates scaling to fit content into A4 printable area (184mm x 270mm), which shrinks single thermal labels incorrectly
3. **Print page-break calculations** (line 2777): Uses `297mm` (A4 height) to determine rows per page, which is wrong for 1-up thermal labels where each label = 1 page

## Fix Plan

### 1. Detect thermal/1-up mode
Add a helper to check if the current sheet type is a thermal 1-up or custom 1-up configuration:
```
const isThermal1Up = sheetType.includes("thermal") || 
  (sheetType === "custom" && customCols === 1 && customRows === 1);
```

### 2. Dynamic `@page` size (line 4433)
Change the `@page` CSS from hardcoded A4 to dynamic:
- For thermal/1-up: `@page { size: ${labelWidth}mm ${labelHeight}mm; margin: 0; }`
- For A4 sheets: keep existing `@page { size: A4; margin: 3mm 0 0 0; }`

### 3. Skip auto-fit scaling for thermal (line 2608)
Update `getAutoFitScale()` to return `1.0` for thermal/1-up labels, since no A4 fitting is needed.

### 4. Fix page-break logic for thermal (line 2777)
For thermal 1-up labels, set `labelsPerPage = 1` instead of calculating based on A4 height (297mm). Each label should be its own "page" when printing on thermal rolls.

### 5. Fix PDF export for thermal (line 2934)
When exporting to PDF with thermal/1-up labels, use the label dimensions as the PDF page format instead of A4.

## Files Changed
- `src/pages/BarcodePrinting.tsx` (all changes in this single file)

