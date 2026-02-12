

## Problem

When printing POS invoices (A5 format) on a laser printer set to A4, the invoice prints on a full A4 sheet with wasted space (as shown in the uploaded photo). Users have to manually change the printer paper size to A5 each time, and then change it back to A4 for barcode label printing. This is tedious and error-prone.

## Root Cause

The `@page { size: ... }` CSS directive is already set in `PrintPreviewDialog.tsx`, but it may not be enforced strongly enough by the browser's print dialog. Some browsers need additional hints, and the current implementation may not be triggering the printer driver's automatic paper size selection reliably.

## Solution

Enhance the print CSS in `PrintPreviewDialog.tsx` to more aggressively enforce paper size selection, and ensure the barcode label printing in `BarcodePrinting.tsx` defaults to A4 properly.

### Changes

**1. `src/components/PrintPreviewDialog.tsx`** - Strengthen `@page` size enforcement

- Add `-webkit-print-color-adjust: exact` and `print-color-adjust: exact` to ensure browser respects print styles
- Add explicit `width` and `height` on `html, body` matching the selected paper size so the browser print dialog auto-selects the correct paper
- For A5 formats, add a visible note to the user in the format selector: "Printer will auto-select A5 paper"
- Ensure the `@page` rule uses the exact CSS keyword `A5` (e.g., `size: A5 portrait`) instead of raw mm values, as some printer drivers respond better to named sizes

**2. `src/pages/BarcodePrinting.tsx`** - Ensure A4 default remains explicit

- The barcode page already defaults to `size: A4` for non-thermal labels -- no changes needed here, but verify it stays correct

### Technical Details

The key change in `PrintPreviewDialog.tsx` `pageStyle`:

```css
@page {
  size: A5 portrait;  /* Use named size instead of '148mm 210mm' */
  margin: 4mm;
}
html, body {
  width: 148mm !important;
  height: 210mm !important;
}
```

Named CSS page sizes (`A4`, `A5`) are better recognized by printer drivers for automatic paper tray selection compared to raw millimeter dimensions. This should eliminate the need to manually switch paper size in the printer settings.

The format mapping will be:
- `a4` -> `size: A4 portrait`
- `a5` -> `size: A5 portrait`  
- `a5-horizontal` -> `size: A5 landscape`
- `thermal` -> `size: 80mm auto` (unchanged)

