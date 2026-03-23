

## Fix: 38×25mm 2-Up Labels Printing Incorrectly (Content Clipped/Overlapping)

### Root Cause
Two CSS rules in `PrecisionPrintCSS.tsx` break multi-column layouts:

1. **Line 64**: `.precision-print-area > div { display: block !important }` — overrides `display: flex` on the row container, so labels stack instead of sitting side-by-side
2. **Lines 74-78**: `.precision-label-container { position: absolute; top: 0; left: 0 }` — forces BOTH labels to the same corner, so they overlap completely

### Changes

**File 1: `src/components/precision-barcode/PrecisionPrintCSS.tsx`**

1. Change line 64 from `display: block !important` to `display: flex !important` — this works for both single-column (single flex child = same as block) and multi-column
2. Remove or scope the `.precision-label-container` absolute positioning rule (lines 74-78). The label container already has `position: relative` set by its parent wrapper div in `PrecisionThermalPrint.tsx`. Instead, keep it `position: relative` so it flows naturally within the flex row.

**File 2: `src/components/precision-barcode/PrecisionThermalPrint.tsx`**

3. Add `overflow: hidden` to each column cell div (line 60) so label content doesn't bleed into the adjacent label
4. Ensure each column wrapper has `position: relative` so the absolute-positioned label fields inside are scoped to their column

### Result
- 2-Up labels render side-by-side: left label shows full content, right label shows full content
- Single-column thermal labels continue to work (flex with one child = identical to block)
- Each 38mm label clips its own content within its boundary

