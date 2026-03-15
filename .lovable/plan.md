

## Problem Analysis

Looking at the user's printed labels vs the preview, the alignment issue on 38×25mm thermal labels stems from multiple problems:

1. **Offset implementation flaw**: `PrecisionLabelPreview` applies X/Y offsets via CSS `transform: translate()` on the label content container, but the parent wrapper in `PrecisionThermalPrint` has `overflow: hidden`. This means negative offsets (like Y-Offset = -0.5mm) cause content to be clipped at the top — explaining why "VELVET" and "ASHA" are partially cut off on printed labels.

2. **Double overflow clipping**: Both the parent wrapper (`PrecisionThermalPrint` line 37) and the label container itself (`PrecisionLabelPreview` line 130) have `overflow: hidden`, creating a double-clip scenario that prevents offset adjustments from working correctly.

3. **V-Gap mismatch**: The app's V-Gap is set to 1mm but the printer's physical gap height is 2mm. The `@page` size is calculated as `labelHeight + vGap` = 26mm, but the actual label pitch should be 27mm (25mm label + 2mm gap). This causes progressive label drift where each successive label prints slightly higher.

## Plan

### 1. Fix offset application in `PrecisionThermalPrint`
Move the X/Y offset from the label container's `transform` to the parent wrapper's `padding`, so offsets shift content within the available space rather than shifting the entire container (which gets clipped).

**File: `src/components/precision-barcode/PrecisionThermalPrint.tsx`**
- Apply `paddingTop` and `paddingLeft` on the per-label wrapper div using `xOffset` and `yOffset` values
- Stop passing `xOffset`/`yOffset` to `PrecisionLabelPreview` (pass 0 instead)

### 2. Fix overflow clipping in `PrecisionLabelPreview`
Change the outer container to not clip when offsets are applied for print mode.

**File: `src/components/precision-barcode/PrecisionLabelPreview.tsx`**
- When `xOffset` and `yOffset` are both 0 (print mode after fix), the transform becomes `translate(0, 0)` — harmless
- Remove `overflow: hidden` from the outer container for print, keep it only in preview

### 3. Fix `PrecisionPrintCSS` page size
Ensure the `@page` size accounts for the actual label pitch properly and add explicit `overflow: visible` for print content.

**File: `src/components/precision-barcode/PrecisionPrintCSS.tsx`**
- Add `overflow: visible` rule for `.precision-label-container` in print media
- Ensure per-label wrapper allows offset padding without clipping

### 4. Validate preview alignment
Ensure the live preview in `LabelCalibrationUI` still renders correctly by keeping the preview-specific offset logic intact (using `scaleFactor` path).

### Summary of changes
- `PrecisionThermalPrint.tsx` — apply offsets as padding on wrapper, not transform on content
- `PrecisionLabelPreview.tsx` — remove overflow:hidden from outer container (or make it configurable)
- `PrecisionPrintCSS.tsx` — add overflow:visible for label containers in print CSS

