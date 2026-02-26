
# Fix Thermal Label Right & Bottom Blank Space

## Problem
When printing 38x25mm labels on TSC TL240, the content appears smaller than the label with visible blank space on the **right side** and **bottom**. The user has to manually set browser scale to 120-140% to compensate, and even then it doesn't fill the label properly like RetailView software does.

## Root Cause
Two issues combine to create the blank space:

1. **Base CSS padding not overridden**: The base `#printArea .label-cell` rule (line 4342) applies `padding: 0.5mm 1.5mm` (1.5mm on left and right). For a 38mm label, that's 3mm of horizontal dead space. The `@media print` thermal override sets `padding: 0 !important` but the base style still affects the initial render.

2. **Content not scaled to fill the physical label**: The browser renders the label content at its natural CSS size (38x25mm) and the printer driver page size is also 38x25mm. However, thermal printers have a built-in non-printable margin (typically 1-2mm on each side). RetailView compensates by rendering content slightly larger than the physical label so the printable area is fully utilized. Our code does `transform: none` for thermal, meaning no compensation for the printer's built-in margins.

3. **Inline `overflow: hidden`** on the cell (line 2784, 2888) clips content at the edges instead of letting it extend to fill the label.

## Solution

### File: `src/pages/BarcodePrinting.tsx`

**1. Remove overflow: hidden from inline cell styles for thermal (lines 2880-2889)**

For thermal 1UP labels, change `overflow: hidden` to `overflow: visible` in the absolute-layout cell inline styles so content can extend to the edges without clipping.

**2. Add a slight scale-up transform in `@media print` for thermal labels (lines 4449-4451)**

Apply a small `transform: scale(1.05)` (5% oversize) to `#printArea` during thermal printing. This compensates for the printer's built-in non-printable margins and ensures content fills the full label area -- similar to how RetailView renders slightly oversized content. The `transform-origin: center center` ensures the scaling is symmetric.

```css
#printArea {
  /* For thermal: scale up 5% to fill label, compensating for printer margins */
  transform: scale(1.05);
  transform-origin: center center;
}
```

**3. Force `padding: 0` in the print override for label-cell (already done but reinforce)**

The existing `padding: 0 !important` in the thermal print block is correct; no change needed here.

**4. Set `overflow: visible` on both `.label-grid` and `.label-cell` in print mode**

Ensure no clipping occurs at any container level during printing.

## Summary of Changes
- `src/pages/BarcodePrinting.tsx`:
  - Inline cell styles: `overflow: hidden` changed to `overflow: visible` for thermal absolute-layout cells
  - `@media print` `#printArea` for thermal: add `transform: scale(1.05); transform-origin: center center;` instead of `transform: none`
  - `@media print` `.label-cell` and `.label-grid` for thermal: ensure `overflow: visible !important`

## Impact
- Only thermal 1UP label printing is affected
- Preview rendering unchanged (transform only applies in `@media print`)
- A4 sheet printing unchanged
- The 5% scale-up eliminates the need for users to manually set 120-140% scale in the browser print dialog -- they can leave it at 100%
