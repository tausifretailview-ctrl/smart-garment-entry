

# Add Alternative Thermal Receipt Format with Settings Selection

## Overview
Create a second thermal receipt format ("Compact Receipt") with a cleaner, modern sans-serif style, and add a setting in Settings > Sale to choose which thermal format to use.

## Changes

### 1. New Component: `src/components/ThermalReceiptCompact.tsx`
A new 80mm thermal receipt component with a different visual style:
- **Sans-serif font** (Arial) instead of monospace Courier
- **Tabular item layout** with columns: Description (name + size), Qty, Price, Total
- GST split calculation: `(line_total * gst_percent) / (100 + gst_percent)` for CGST/SGST
- Centered header with Store Name (bold), Address, GSTIN
- Compact spacing, thinner separators (single dashed lines instead of double equals)
- Same props interface as `ThermalPrint80mm` for drop-in compatibility
- Same UPI QR code, loyalty points, and payment breakdown features

### 2. Settings Update: `src/pages/Settings.tsx`
- Add `thermal_receipt_style` field to the `SaleSettings` interface (values: `'classic'` | `'compact'`)
- Add a new dropdown **"Thermal Receipt Style"** in the Sale settings section, shown below the existing "Sales Invoice Bill Format" dropdown
- Options: "Classic (Monospace)" and "Compact (Sans-serif)"
- Default: `'classic'` (current behavior unchanged)

### 3. InvoiceWrapper Update: `src/components/InvoiceWrapper.tsx`
- Import `ThermalReceiptCompact`
- When format is `'thermal'` or `'thermal-receipt'`, check `settings.sale_settings.thermal_receipt_style`
- If `'compact'`, render `ThermalReceiptCompact`; otherwise render existing `ThermalPrint80mm`

### 4. POSSales Integration: `src/pages/POSSales.tsx`
- Same logic: check `thermal_receipt_style` when rendering thermal format to pick the correct component

## Technical Notes
- No database changes needed -- the setting is stored in the existing `sale_settings` JSONB column
- The new component reuses the same `ThermalPrint80mmProps` interface
- Existing behavior is completely unchanged (defaults to classic)
