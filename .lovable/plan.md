

# Fix Barcode Label Print Alignment for 38x25mm Thermal Labels

## Problem
The label preview looks correct, but the actual printed output on the TSC TL240 printer is misaligned and doesn't fill the 38x25mm label properly. Content appears smaller/shifted compared to the preview.

## Root Cause
The `#printArea` container is hardcoded to `width: 210mm; min-height: 297mm` (A4 dimensions) even when printing thermal 1UP labels. When the browser prints with `@page { size: 38mm 25mm }`, it tries to fit a 210mm-wide container into a 38mm page, causing the content to shrink dramatically. The `@media print` rules override `label-grid` and `label-cell` sizes but the parent `#printArea` container remains at 210mm, creating a mismatch.

## Solution
Update the CSS in `src/pages/BarcodePrinting.tsx` to make the `#printArea` dimensions dynamic based on whether we're printing thermal or A4 labels.

### Changes to `src/pages/BarcodePrinting.tsx`

**1. Fix `#printArea` base styles (lines 4306-4312)**
Make the `#printArea` dimensions conditional -- for thermal 1UP labels, use the actual label dimensions instead of A4.

```css
#printArea {
  /* For thermal: use label width; for A4: use 210mm */
  width: ${isThermal1Up() ? labelWidthMm + 'mm' : '210mm'};
  min-height: ${isThermal1Up() ? labelHeightMm + 'mm' : '297mm'};
  padding: 0;
  margin: 0;
}
```

**2. Fix `@media print` `#printArea` rules (lines 4409-4418)**
For thermal labels, explicitly set the width/height to match the label size and remove any extra space:

```css
#printArea {
  position: absolute;
  left: 0;
  top: 0;
  display: block !important;
  width: ${isThermal1Up() ? labelWidthMm + 'mm' : '210mm'} !important;
  min-height: auto !important;
  transform: none;
  transform-origin: top left;
  overflow: visible;
}
```

**3. Fix `.label-grid` print styles for thermal**
Remove the fixed height constraint on `.label-grid` for thermal so content flows naturally within the label:

```css
.label-grid {
  /* For thermal: no extra gap, display flex instead of grid */
  width: ${labelWidthMm}mm;
  padding: 0 !important;
  margin: 0 !important;
}
```

**4. Fix `.label-cell` print styles for thermal**
Ensure the cell uses the full label area with no extra padding:

```css
.label-cell {
  width: ${labelWidthMm}mm !important;
  height: ${labelHeightMm}mm !important;
  padding: 0 !important;
  margin: 0 !important;
  overflow: hidden;
  box-sizing: border-box;
}
```

These changes will compute the label width/height values from the current sheet type selection (38mm and 25mm for the `thermal_38x25_1up` preset) and apply them consistently to `#printArea`, `.label-grid`, and `.label-cell` in the `@media print` block so the browser renders the content at the exact physical label size.

## Impact
- Only `src/pages/BarcodePrinting.tsx` is modified
- Only affects the `@media print` and base CSS for `#printArea`
- Preview rendering is unchanged
- A4 sheet printing is unchanged (conditional logic)
- All thermal label sizes benefit from this fix, not just 38x25mm
