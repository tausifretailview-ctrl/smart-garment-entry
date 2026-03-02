
# Precision Pro Barcode Printing System

## Overview
Add a new "Precision Pro" barcode printing mode alongside the existing (Classic) system. This mode uses absolute mm-based positioning for pixel-perfect label alignment on both thermal sticker printers and laser A4 sheet printers.

## What Gets Built

### 1. New Settings Sub-Section in "Bill & Barcode" Tab
A new card titled "Precision Pro Barcode Printing" will be added inside the existing Bill & Barcode settings tab (`Settings.tsx`), containing:
- **Printing Mode Toggle**: Switch between "Classic Browser" (current system) and "Precision Pro"
- **Calibration Fields**: X-Offset (mm), Y-Offset (mm), Vertical Gap (mm) -- stored in `bill_barcode_settings`
- **Label Size Inputs**: Width (mm) and Height (mm) for thermal sticker mode
- **A4 Sheet Grid Config**: Labels per row, Labels per column

### 2. New Component: `PrecisionLabelPreview.tsx`
A reusable component that renders a single barcode label using absolute mm positioning:
- Container DIV with exact physical dimensions (e.g., `width: 50mm; height: 25mm`)
- All sub-elements (product name, barcode SVG, price, size) absolutely positioned within the container
- X/Y offset applied as CSS `transform: translate()` on the container for manual centering
- SVG barcodes rendered via JsBarcode for thermal sharpness
- CSS `image-rendering: pixelated` applied to barcode elements

### 3. New Component: `PrecisionThermalPrint.tsx` (Sticker Mode)
- Renders a single label per page using `@page { size: [width]mm [height]mm; margin: 0 }`
- Uses `PrecisionLabelPreview` for the label content
- Applies user calibration offsets

### 4. New Component: `PrecisionA4SheetPrint.tsx` (Laser Mode)
- Renders a fixed `210mm x 297mm` container
- CSS Grid layout: `grid-template-columns: repeat(cols, 1fr)` and matching rows
- Each cell contains a `PrecisionLabelPreview`
- X/Y offset adjusts the sheet's padding to compensate for printer tray misalignment
- Vertical Gap setting controls `row-gap` in the grid

### 5. Integration with Barcode Printing Page
- `BarcodePrinting.tsx` will check the `precision_pro_enabled` setting
- When Precision Pro is active, it uses the new components instead of the classic rendering path
- Existing classic system remains completely untouched

## Settings Storage
New fields added to `BillBarcodeSettings` interface:

```text
precision_pro_enabled: boolean
precision_x_offset: number (mm)
precision_y_offset: number (mm)  
precision_v_gap: number (mm)
precision_label_width: number (mm, default 50)
precision_label_height: number (mm, default 25)
precision_a4_cols: number (default 4)
precision_a4_rows: number (default 12)
```

All stored in the existing `bill_barcode_settings` JSON column -- no database migration needed.

## Files to Create
1. `src/components/precision-barcode/PrecisionLabelPreview.tsx` -- Single label renderer with absolute mm positioning
2. `src/components/precision-barcode/PrecisionThermalPrint.tsx` -- Thermal sticker print wrapper
3. `src/components/precision-barcode/PrecisionA4SheetPrint.tsx` -- A4 grid sheet print wrapper
4. `src/components/precision-barcode/PrecisionPrintCSS.tsx` -- Print-specific CSS styles component

## Files to Modify
1. `src/pages/Settings.tsx` -- Add Precision Pro settings card in the Bill & Barcode tab with mode toggle and calibration inputs
2. `src/pages/BarcodePrinting.tsx` -- Add conditional rendering to use Precision Pro components when enabled
3. `src/types/labelTypes.ts` -- Add precision settings type (optional, may just use inline types)

## Barcode Sharpness Strategy
- All barcodes rendered as inline SVGs using JsBarcode's `SVG` element mode (not canvas/image)
- CSS rule: `image-rendering: pixelated; -webkit-print-color-adjust: exact`
- SVG preserves vector quality at any DPI, ensuring sharp thermal printing
