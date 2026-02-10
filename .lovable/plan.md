

# Fix: Barcode Labels Overflowing at Default Print Scale (100%)

## Problem

The custom "48" label preset (48mm wide, 4 columns, 2mm gap) creates a total content width of 198mm. When printing with the browser's "Default" margins (~12.7mm per side), the available print area is only ~185mm. This causes labels to overflow off the page at 100% scale.

The user currently has to manually set the browser print dialog scale to 150% (or change margins to "None") each time they print -- this should work automatically.

## Root Cause

The `@page` CSS rule sets `margin: 3mm 0 0 0`, but browsers like Chrome ignore this when the user selects "Default" margins in the print dialog. The print content assumes full A4 width (210mm) is available, but default margins reduce it significantly.

## Solution

Auto-calculate a "fit-to-page" scale factor based on the actual content width vs the available A4 printable area (accounting for typical default margins). This will be applied automatically in the `@media print` CSS transform, so labels always fit at the browser's default 100% scale without manual adjustment.

### How It Works

```text
Content width = (cols x labelWidth) + ((cols-1) x gap) + leftOffset + rightOffset
A4 printable width = 210mm - 26mm (default margins) = 184mm
Auto-scale = min(1, printableWidth / contentWidth)
Final scale = printScale / 100 * autoScale
```

For the user's "48" preset:
- Content width = (4 x 48) + (3 x 2) + 0 + 0 = 198mm
- Auto-scale = 184 / 198 = 0.929
- At printScale=100: final transform = scale(0.929) -- labels fit perfectly

Similarly for height, the same calculation ensures rows don't overflow vertically.

## Technical Changes

### File: `src/pages/BarcodePrinting.tsx`

**1. Add auto-fit scale calculation (near line 2827)**

Add a helper that computes the scale factor needed to fit labels within the A4 default-margin printable area (approximately 184mm x 270mm):

```typescript
const getAutoFitScale = () => {
  const dims = sheetType === "custom"
    ? { cols: customCols, rows: customRows, width: customWidth, height: customHeight, gap: customGap }
    : { cols: sheetPresets[sheetType].cols, ... };

  const contentWidth = (dims.cols * dims.width) + ((dims.cols - 1) * dims.gap) + leftOffset + rightOffset;
  const contentHeight = (dims.rows * dims.height) + ((dims.rows - 1) * dims.gap) + topOffset + bottomOffset;

  const printableWidth = 184;  // A4 210mm - ~26mm default margins
  const printableHeight = 270; // A4 297mm - ~27mm default margins

  const scaleX = contentWidth > printableWidth ? printableWidth / contentWidth : 1;
  const scaleY = contentHeight > printableHeight ? printableHeight / contentHeight : 1;

  return Math.min(scaleX, scaleY);
};
```

**2. Update print CSS transform (line 4369)**

Change from:
```css
transform: scale(${printScale / 100});
```

To:
```css
transform: scale(${(printScale / 100) * getAutoFitScale()});
```

This ensures labels auto-fit within default browser margins. The user's "Print Scale %" setting still works as an additional multiplier (100% = auto-fit, 120% = 20% larger than auto-fit, etc.).

**3. Update the scale hint text (near line 3545)**

Change the helper text from "100% = normal, 150% = larger" to "100% = auto-fit to page" so users understand the new behavior.

## Expected Result

- At Print Scale 100% with browser "Default" margins: labels fit perfectly on the page, no overflow
- The user no longer needs to manually change the browser print dialog scale
- Desktop view: No visual change
- The Print Scale slider still works as a relative multiplier for fine-tuning
