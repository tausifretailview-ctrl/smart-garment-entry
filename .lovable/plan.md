

# Direct Invoice Printing via QZ Tray - Implementation Plan

## Overview
Add QZ Tray-based direct printing for invoices (thermal and laser) in both POS and Sales Invoice screens. This builds on the existing `useQZTray` hook and `DirectPrintDialog` infrastructure already in the project. Existing PDF preview printing remains untouched.

## What Changes

### 1. Settings UI - "Bill & Barcode" Tab
Add a new "Direct Printing (QZ Tray)" settings card (similar to the existing Cash Drawer card) with:
- **Enable Direct Printing** toggle (stored in `bill_barcode_settings.enable_direct_print`)
- **Sale Invoice Printer** - dropdown auto-populated from QZ Tray detected printers
- **POS Printer** - separate dropdown for POS printer selection
- **Auto Print After Save** toggle - when enabled, print fires automatically after sale save (no print confirmation dialog)
- **Test Print** button to verify printer connectivity
- Connect/Refresh printer list button with QZ Tray status indicator

Settings are stored in the existing `bill_barcode_settings` JSONB column -- no database migration needed.

### 2. New Utility: `src/utils/directInvoicePrint.ts`
A utility module that handles:
- **`printThermalReceipt(invoiceData, printerName)`**: Renders the existing `ThermalPrint80mm` component to HTML, then sends via QZ Tray as HTML pixel print (not raw ESC/POS -- this reuses the existing styled thermal template exactly as-is)
- **`printLaserInvoice(invoiceData, printerName, paperSize)`**: Renders the existing `InvoiceWrapper` component to HTML and sends via QZ Tray as HTML pixel print for A4/A5
- **`printViaQZTray(html, printerName, config)`**: Core function that takes rendered HTML and prints via QZ Tray pixel printing mode
- Fallback: if QZ Tray is unavailable or print fails, automatically falls back to the existing `useReactToPrint` browser print dialog

### 3. New Hook: `src/hooks/useDirectPrint.ts`
A hook that wraps QZ Tray + settings logic:
- Reads `bill_barcode_settings` to check if direct printing is enabled
- Determines printer name based on context (POS vs Sale)
- Determines format (thermal vs laser) based on `pos_bill_format` / `sales_bill_format` settings
- Exposes `directPrint(invoiceRef, options)` method
- Handles fallback to browser print if QZ unavailable
- Manages connection lifecycle (reuse websocket, auto-reconnect)

### 4. POS Integration (`src/pages/POSSales.tsx`)
Modify the `handlePrintFromDialog` function:
- If direct printing is enabled AND QZ Tray is connected:
  - Get the rendered invoice HTML from `invoicePrintRef`
  - Send to QZ Tray via the new `useDirectPrint` hook
  - Skip browser print dialog entirely
- If auto-print is enabled:
  - After successful save, skip the print confirmation dialog and directly print
- Fallback to existing `handlePrint()` (useReactToPrint) if QZ fails

### 5. Sales Invoice Integration (`src/pages/SalesInvoice.tsx`)
Same pattern as POS:
- Modify `handlePrintInvoice` to check direct print settings
- Use `useDirectPrint` hook for QZ Tray printing
- Fallback to existing browser print

### 6. QZ Tray Script Loading
Add QZ Tray script tag to `index.html` (loaded from CDN). The existing `useQZTray` hook already handles connection -- the script just needs to be available globally.

## What Does NOT Change
- No database migrations (settings stored in existing JSONB column)
- No changes to invoice numbering logic
- No changes to RLS policies
- No changes to sale triggers or save flow
- No removal of existing PDF preview functionality
- No changes to existing invoice templates
- Existing `useReactToPrint` flow remains as fallback

## Technical Details

### BillBarcodeSettings Interface Extension
```typescript
interface BillBarcodeSettings {
  // ... existing fields ...
  enable_direct_print?: boolean;
  direct_print_sale_printer?: string;
  direct_print_pos_printer?: string;
  direct_print_auto_print?: boolean;
}
```

### QZ Tray Pixel Printing Approach
Instead of generating raw ESC/POS commands (which would require rebuilding templates), we use QZ Tray's HTML pixel printing mode. This renders the existing React invoice components as HTML and sends them to the printer -- reusing all existing templates exactly.

```typescript
// Conceptual flow
const config = qz.configs.create(printerName, {
  size: { width: 80, height: null }, // thermal
  units: 'mm',
  rasterize: true,
});
const data = [{ type: 'pixel', format: 'html', data: invoiceHTML }];
await qz.print(config, data);
```

### File Changes Summary
| File | Action |
|------|--------|
| `index.html` | Add QZ Tray CDN script |
| `src/utils/directInvoicePrint.ts` | New - QZ pixel print utility |
| `src/hooks/useDirectPrint.ts` | New - Direct print hook |
| `src/pages/Settings.tsx` | Add Direct Printing settings card in Bill & Barcode tab |
| `src/pages/POSSales.tsx` | Integrate direct print in print flow |
| `src/pages/SalesInvoice.tsx` | Integrate direct print in print flow |

### Extensibility
The structure supports future additions:
- Multiple printer profiles (kitchen/counter)
- Cash drawer integration (already exists)
- Silent background reprint
- Fee receipt direct printing (school module)

