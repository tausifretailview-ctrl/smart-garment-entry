
## Fix: Label Content Shifting After First 4 Rows

### Problem
On Al Nisa's 40-label sheet (5x8, 40x35mm), the first 4 rows print correctly but subsequent rows shift upward, causing misalignment with the physical label sheet.

### Root Cause
The CSS grid uses `grid-auto-rows` which sets a **minimum** height, not a strict fixed height. When label content varies slightly (shorter text, smaller barcode), rows can collapse below the specified height. Over 8 rows, this cumulative drift becomes visible.

Additionally, label cells don't enforce a strict `min-height` and `max-height`, allowing the browser to adjust cell sizes based on content.

### Fix Plan

**File: `src/pages/BarcodePrinting.tsx`**

1. **Replace `grid-auto-rows` with `grid-template-rows`** - Use explicit row definitions that enforce exact heights:
   - Change: `grid-auto-rows: ${height}mm` 
   - To: `grid-template-rows: repeat(${rows}, ${height}mm)`
   - Apply to both preview grids (~line 2751) and print grids (~line 2825)

2. **Enforce strict cell dimensions** - Add `min-height` and `max-height` to every label cell to prevent content from stretching or collapsing cells:
   - Add to cell styles: `min-height: ${height}mm; max-height: ${height}mm;`
   - Apply to both absolute-layout and legacy-flow cell styles (4 places total: preview absolute, preview legacy, print absolute, print legacy)

3. **Fix the static CSS `.label-cell` defaults** - Update the fallback `.label-cell` style at line 4301 to include `overflow: hidden` to prevent content from spilling out of fixed-size cells.

### Technical Details

```text
Changes in generatePreview function:

Grid divs (lines ~2750 and ~2825):
  Before: grid-auto-rows: ${dimensions.height}mm;
  After:  grid-template-rows: repeat(${rows}, ${dimensions.height}mm);

Cell divs (4 locations: ~2773, ~2783, ~2851, ~2861):
  Add: min-height: ${dimensions.height}mm; max-height: ${dimensions.height}mm;

The rows count for print mode grid-template-rows will use:
  - Preview: rowsPerPage (calculated from available height)
  - Print: actual number of rows on that page (endIdx - startIdx) / cols, rounded up
```

These changes ensure each label cell occupies exactly 35mm height regardless of content, preventing the upward drift that occurs after the first few rows.
