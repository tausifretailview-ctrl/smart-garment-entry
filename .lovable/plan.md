

## Plan: Fix Browser Print for 38x25 1-Up Thermal Labels

### Problem Analysis
From the photos: the preview looks correct, but browser print output has two issues:
1. **Font is too small / not bold enough** compared to preview
2. **Labels after the first one shift upward** — content drifts toward the top edge on subsequent labels

### Root Cause
In the `@media print` CSS for thermal 1-up labels:

1. **Scaling issue**: `transform: scale(1.05); transform-origin: center center;` on `#printArea` — scaling from center causes cumulative vertical shift across multiple page breaks. Each label-grid is a separate page, but the transform displaces them all relative to center of the entire container.

2. **Font size**: The base `.label-cell` style sets `font-size: 9px` which is too small for 38x25mm. The print CSS overrides with `font-size: inherit !important` but the inherited size is still small. Bold fields use inline `font-weight: bold` but the print CSS override `text-align: initial !important` may interfere with rendering.

### Changes to `src/pages/BarcodePrinting.tsx`

**1. Fix the transform scaling for thermal 1-up**
- Change `transform-origin: center center` to `transform-origin: top left` so scaling does not shift content
- Remove or reduce the `scale(1.05)` — it was meant to compensate for browser print margins but causes drift on multi-label jobs. Set to `scale(1.0)` (no scaling) since `@page { margin: 0 }` already handles margins

**2. Ensure each label-grid is self-contained for page breaks**
- Add `position: relative` to each `.label-grid` in print mode so page breaks work cleanly without accumulated offset

**3. Fix font rendering in print**
- Remove `font-size: inherit !important` override from `.label-cell` print CSS — let inline font sizes from the designer take effect
- Add `-webkit-text-stroke: 0.3px black` to `.label-cell` in print mode to ensure bold text appears darker on print (matching how thermal receipts handle this)
- Ensure `font-weight` from inline styles is not overridden

**4. For the label-cell > div (absolute positioned fields)**
- Keep `position: absolute !important` but ensure the parent `.label-cell` has proper dimensions without the `font-size: inherit` override interfering

### Summary
- Remove `scale(1.05)` transform (or use `1.0`) and fix transform-origin to `top left`
- Remove `font-size: inherit !important` from print `.label-cell` to respect designer font sizes
- Add text stroke for bolder print output
- These are CSS-only changes in the `<style>` block at bottom of BarcodePrinting.tsx

