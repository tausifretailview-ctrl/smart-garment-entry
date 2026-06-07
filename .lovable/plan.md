## Problem

After printing barcode labels and then opening the thermal receipt print, the invoice appears shrunken in the print preview (Chrome and Edge). It only happens once a barcode print has run in the same session.

## Root cause

`src/pages/BarcodePrinting.tsx` renders a JSX `<style>` block (around line 6178 / 6268) that contains an `@page` rule, e.g.:

```css
@page { size: 50mm 30mm; margin: 0; }
```

This `<style>` is part of the React tree and stays mounted while the Barcode Printing tab is alive. With Window Tabs keeping pages mounted, the rule remains in the document even after the user leaves the page.

When the user later opens the thermal receipt print preview, `react-to-print` (used by `PrintPreviewDialog`) clones the parent document's styles into the hidden print iframe. CSS `@page` rules do not cascade by selector specificity — the leftover label-sized `@page size: 50mm 30mm` competes with the dialog's intended thermal `@page size: 80mm auto`, and the browser/driver collapses the receipt to the smaller page, producing the "shrink" the user sees.

This matches the reproduction signal exactly: only after a barcode print, in both Chrome and Edge.

## Fix

Scope the BarcodePrinting `@page` so it is only present in the document while the user is actually printing labels.

1. **Extract the `@page` rule out of the permanent JSX `<style>**` in `src/pages/BarcodePrinting.tsx` (the block starting at line 6178 and the `@page { size: ... }` at line 6268). Keep the non-`@page` print rules (visibility, label-cell layout) in the persistent style — those are scoped to `#printArea` and don't conflict.
2. **Dynamically attach the `@page` rule only during a print**:
  - Add a small helper that, just before triggering `window.print()` on the barcode page, creates a `<style id="barcode-active-page-rule">` element with the current `@page { size: ...; margin: ... }` and appends it to `document.head`.
  - Remove that element on `window.onafterprint` (and as a fallback, on a `setTimeout` cleanup) so no `@page` rule from the barcode tab survives the print job.
  - Apply this to both the precision-print path and the standard print path (the two code branches that currently emit `@page`).
3. **Audit the other inline `@page` sources** found in the codebase to confirm none of them have the same "persistent JSX `<style>`" pattern:
  - `src/utils/barcodePrinter.ts`, `src/utils/barcodeDesktopPrint.ts`, `src/utils/thermalReceiptPrintDocument.ts` already inject into isolated documents/iframes — safe, no change needed.
  - Other pages that grep matched (`POSDashboard`, `SaleOrderDashboard`, etc.) need a quick check; if any render `@page` in the persistent React tree, apply the same dynamic mount/unmount pattern. Otherwise leave them alone.
4. **No changes to `PrintPreviewDialog.tsx**` — its own `pageStyle` is correct; the leak is upstream.

## Verification

- Reload, print a thermal receipt → confirm correct 80mm size.
- Open Barcode Printing, print labels → confirm labels still print at configured label size.
- Without reloading, immediately print a thermal receipt → confirm it is no longer shrunken (the `@page size` should now be 80mm again).
- Repeat the sequence in both Chrome and Edge.
- Confirm `document.head` contains no `barcode-active-page-rule` style element after the barcode print dialog closes.

## Out of scope

- No changes to thermal templates or `PrintPreviewDialog`.
- No backend / DB changes.
- Barcode printing setting not change only work thermal receipt Print problem preview show attachment image 