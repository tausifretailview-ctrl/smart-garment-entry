

## Fix Standard Printing A4 Sheet Print Alignment

### Problem
The `@media print` CSS uses `transform: scale()` on `#printArea`, which is a visual-only effect that doesn't change actual print layout dimensions. This causes overflow, clipping, and misalignment. Additionally, hardcoded `.label-grid` dimensions (33mm/19mm) conflict with dynamically generated inline styles.

### Changes

**File: `src/pages/BarcodePrinting.tsx`**

1. **Remove `transform: scale()` from `@media print #printArea`** (lines 5246-5248)
   - Delete the conditional transform block, keep only `overflow: visible !important;`

2. **Remove hardcoded `.label-grid` dimensions** (lines 5119-5124)
   - Replace with just `display: grid;` — actual dimensions come from inline styles via `generatePreview()`

3. **Fix `@page` rule** (lines 5204-5209)
   - Change `'A4'` to `'A4 portrait'` and `margin: 0 !important` to `margin: 0mm !important`

4. **Update Print Scale label** (lines 3930-3941)
   - Rename "Print Scale (%)" to "PDF Export Scale (%)"
   - Change helper text to "Only affects PDF export. Direct printing always uses 100%."

5. **Add zoom reset in `handlePrint`** (lines 3111-3121)
   - Save/restore `document.body.style.zoom` around the `window.print()` call to prevent inherited zoom from affecting print output

