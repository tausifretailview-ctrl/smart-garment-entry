
# Precision Pro Label Designer

## Overview
Enhance the existing Precision Pro barcode system with a full visual label designer. Users will be able to toggle fields on/off, set exact X/Y coordinates (in mm), font sizes, and barcode dimensions -- all rendered with absolute positioning for pixel-perfect prints.

## What Changes

### 1. New Component: `PrecisionLabelDesigner.tsx`
A configuration panel (sidebar-style) that lets users design their precision label layout:

**Per-field controls** (Product Name, Brand, Size, Price/MRP, Barcode, Barcode Text, Custom Text, Bill Number, Supplier Code, Purchase Code):
- Toggle show/hide
- X position (mm from left edge)
- Y position (mm from top edge)
- Font size (pt)
- Bold toggle
- Width (mm) for text truncation
- Text alignment (left/center/right)

**Barcode-specific controls:**
- Barcode height (mm)
- Barcode width (line thickness)

**Template save/load** using existing `useBarcodeLabelSettings` hook (label_template type with mm-based config).

### 2. Update `PrecisionLabelPreview.tsx`
Replace the current hardcoded layout with a config-driven renderer:
- Accept a `LabelDesignConfig` prop (reuses the existing type which already has `x`, `y`, `width` fields)
- Each field renders as an absolutely positioned `div` using `top: {y}mm; left: {x}mm`
- Barcode renders as SVG via JsBarcode with `image-rendering: pixelated`
- The container uses `transform: translate(xOffset, yOffset)` for calibration

### 3. Update Settings Page (`Settings.tsx`)
Add to the existing Precision Pro card:
- A "Design Label Layout" button that opens the designer inline or in a dialog
- The designer will show a live preview of the label at the configured dimensions
- Field positions are saved as part of the precision settings in `bill_barcode_settings`

### 4. Update `BarcodePrinting.tsx`
- When Precision Pro is enabled, pass the stored field config to `PrecisionLabelPreview`
- Add a "Designer" button/tab in the barcode printing page for quick access to adjust layout
- Both thermal and A4 print paths use the same config-driven preview

### 5. Update Print Components
- `PrecisionThermalPrint.tsx` and `PrecisionA4SheetPrint.tsx` will pass the label config through to `PrecisionLabelPreview`

## Data Storage
No database migration needed. The field layout config will be stored in the existing `bill_barcode_settings` JSON column as `precision_label_config` (a `LabelDesignConfig` object). Templates are saved via the existing `useBarcodeLabelSettings` hook.

## Files to Create
1. `src/components/precision-barcode/PrecisionLabelDesigner.tsx` -- The designer panel with per-field X/Y/font/toggle controls and live preview

## Files to Modify
1. `src/components/precision-barcode/PrecisionLabelPreview.tsx` -- Make config-driven instead of hardcoded layout
2. `src/components/precision-barcode/PrecisionThermalPrint.tsx` -- Pass label config through
3. `src/components/precision-barcode/PrecisionA4SheetPrint.tsx` -- Pass label config through
4. `src/pages/Settings.tsx` -- Add precision label config storage and designer button
5. `src/pages/BarcodePrinting.tsx` -- Load and pass precision label config; add designer access

## Technical Details

### PrecisionLabelPreview Config-Driven Rendering
```text
Container: width={labelWidth}mm, height={labelHeight}mm, position=relative, overflow=hidden
  transform: translate(xOffset mm, yOffset mm)

For each field in config where show=true:
  <div style="position:absolute; top:{field.y}mm; left:{field.x}mm; 
       width:{field.width}mm; font-size:{field.fontSize}pt;
       font-weight:{field.bold ? 700 : 400}; text-align:{field.textAlign}">
    {field content}
  </div>

Barcode SVG:
  position:absolute; top:{barcode.y}mm; left:{barcode.x}mm
  JsBarcode SVG with image-rendering: pixelated
```

### PrecisionLabelDesigner Layout
```text
+---------------------------+-------------------+
| Field Controls (scroll)   | Live Preview      |
|                           |                   |
| [x] Product Name          | +---------------+ |
|   X: [10] Y: [2] Size:[9]| | Brand         | |
|   Bold: [x] Align: [C]   | | Product Name  | |
|                           | | Size  Price   | |
| [x] Brand                 | | ||||||||||||| | |
|   X: [5]  Y: [0] Size:[8]| | 12345678      | |
|                           | +---------------+ |
| [x] Barcode               |                   |
|   X: [5] Y: [12] H: [8]  |                   |
+---------------------------+-------------------+
```

### Default Precision Config
A sensible default layout matching the current hardcoded preview will be provided so existing users see no change until they customize.
