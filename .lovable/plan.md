

## Improve Barcode Print Quality -- Switch to SVG Rendering

### Problem
Currently, all barcode labels are rendered using **canvas-to-PNG** conversion (`renderBarcodeToDataURL`). This produces bitmap images that:
- Lose sharpness when scaled down for small labels
- Produce blurry/distorted barcode lines on thermal printers
- Result in scanning failures (as shown in the circled barcode in the uploaded image)

### Solution
Replace all canvas/PNG barcode rendering with **inline SVG** output. SVG barcodes are vector-based, so they:
- Scale perfectly to any label size without blur
- Maintain crisp barcode lines on both thermal and laser printers
- Produce reliable scan results regardless of print resolution

### Changes

**File 1: `src/utils/barcodePrinter.ts`**

1. Replace the `renderBarcodeToDataURL` function with a new `renderBarcodeToSVG` function that:
   - Creates an SVG element using `document.createElementNS`
   - Renders the barcode via `JsBarcode(svg, code, {...})` 
   - Serializes to an SVG string using `XMLSerializer`
   - Returns the inline SVG HTML string (not a data URL)

2. Update all 4 locations that call `renderBarcodeToDataURL`:
   - `getAbsolutePositionLabelHTML` (line ~156) -- custom designer labels
   - `getCompactThermalLabelHTML` (line ~215) -- compact thermal labels
   - `getLegacyLabelHTML` (line ~272) -- legacy flow labels
   - Replace `<img src="...">` with inline SVG strings

**File 2: `src/pages/BarcodePrinting.tsx`**

1. Replace the local `renderBarcodeToDataURL` function (line ~106) with a similar `renderBarcodeToSVG` approach

2. Update the PDF generation flow (line ~3088-3165):
   - Instead of the complex SVG-to-canvas-to-PNG pipeline, keep SVG elements directly in the DOM for `html2canvas` capture at high scale (already using `scale: 3`)
   - Simplify the barcode rendering in the print preparation step

3. Update the browser print flow to use inline SVG for all label barcodes

### Technical Details

**New `renderBarcodeToSVG` function:**
```text
function renderBarcodeToSVG(code, height, width):
  1. Create SVG element via document.createElementNS
  2. Call JsBarcode(svg, code, { format: 'CODE128', height, width, displayValue: false, margin: 0, background: 'transparent' })
  3. Set explicit width/height attributes on SVG
  4. Serialize via new XMLSerializer().serializeToString(svg)
  5. Return the raw SVG string for inline embedding
```

**What stays the same:**
- JsBarcode library (already installed)
- CODE128 format
- All label layout positioning
- Preview rendering (already uses SVG)
- QR code rendering (separate system, unchanged)

**Key benefit:** The preview already uses SVG rendering (lines 536-548 in BarcodePrinting.tsx). This change makes the print output match the preview quality -- what you see is what you print.

