

# Fix Thermal Label Print: Small Font and Top-Left Shift

## Problem
For 38x25mm thermal labels, the preview renders correctly but the actual printed output has:
1. **Smaller fonts** than the preview shows
2. **Content shifted to top-left** instead of matching preview positioning

## Root Cause
Two CSS conflicts in the print stylesheet:

1. **Base CSS overrides inline styles**: The stylesheet rule `#printArea .label-cell` applies `display: flex; flex-direction: column; align-items: center; font-size: 9px;` which persists during printing. The absolute-positioned label cells set `position: relative` via inline styles, but the stylesheet's flex properties and tiny `font-size: 9px` still apply, interfering with the rendered layout.

2. **Missing `position: relative`** in print CSS: The `@media print` block for thermal `.label-cell` doesn't enforce `position: relative !important`, so absolute-positioned child elements may lose their positioning context.

3. **No display override for thermal cells**: The absolute-layout cells need `display: block` but the CSS keeps `display: flex` from the base styles, causing layout conflicts.

## Solution

### File: `src/pages/BarcodePrinting.tsx`

**1. Update the base `#printArea .label-cell` styles (around line 4341)** to not conflict with absolute positioning:

- Wrap the `display: flex` and related properties in a `:not(.absolute-layout)` selector, OR
- Simply add a thermal-specific override in the print CSS

**2. Update `@media print` `.label-cell` rules for thermal (around line 4482)** to add:

```css
#printArea .label-cell {
  position: relative !important;
  display: block !important;     /* Override flex for absolute-positioned children */
  font-size: inherit !important; /* Don't force 9px on thermal labels */
  overflow: visible !important;  /* Allow content to render fully */
  width: 38mm !important;
  height: 25mm !important;
  padding: 0 !important;
  margin: 0 !important;
}
```

**3. Ensure child absolute-positioned divs use `!important` on key properties** in the print CSS:

```css
#printArea .label-cell > div {
  position: absolute !important;  /* Ensure children stay absolute */
}
```

**4. Add explicit `font-size: initial` reset** so the 9px base doesn't shrink all text in thermal labels.

These 4 changes ensure the print engine renders thermal label cells identically to the preview -- with correct font sizes from inline styles and proper absolute positioning of all fields.

## Impact
- Only `src/pages/BarcodePrinting.tsx` is modified
- Only the `@media print` CSS block for thermal labels is affected
- Preview rendering stays unchanged
- A4 sheet label printing stays unchanged (conditional logic)
