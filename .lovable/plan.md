# Fix: Thermal receipt prints as blank narrow page after using Barcode Printing

## Root cause

The previous fix gated the inline `<style>` block in `BarcodePrinting.tsx`, but there is a **second, stronger leak**: `src/components/precision-barcode/PrecisionPrintCSS.tsx`.

That component, via `useEffect`, injects `<style id="precision-print-css">` directly into `document.head`. The style contains:

- `@page { size: <labelWidth>mm <labelHeight>mm; margin: 0 }`
- `body * { visibility: hidden }` + `.precision-print-area * { visibility: visible }`

It is mounted whenever the Barcode Printing → Precision Pro tab is active (or the Test Label area is mounted), even when no print is happening. Because the WindowTabs system keeps pages alive in the background, this `<style>` survives navigation. When the user then opens the Print Preview dialog from POS and prints a thermal receipt:

1. The browser uses the precision `@page` size (58×30mm or similar) instead of the receipt's `80mm auto` → tiny page.
2. `body * { visibility: hidden }` hides the entire receipt; only elements inside `.precision-print-area` (which is the barcode label area) stay visible → that's why the user sees just a small barcode in the print preview.

This matches the screenshot exactly (narrow page, barcode at top, no receipt body) and the "only after barcode print" reproduction.

## Fix

Gate the precision style injection on an "active print" flag, exactly like the standard tab fix.

### 1. `src/components/precision-barcode/PrecisionPrintCSS.tsx`

- Add a new optional prop `active?: boolean` (default `false`).
- Inside the `useEffect`, only create / update the `<style>` when `active === true`. When `active` is false, remove any existing `#precision-print-css` element.
- Keep the unmount cleanup that removes the style.

### 2. `src/pages/BarcodePrinting.tsx`

- Reuse existing `printPageActive` state + the `afterprint` listener already added in the previous fix.
- Pass `active={printPageActive}` to both `PrecisionPrintCSS` usages (test label block at ~L6145 and the conditional one referenced inside `PrecisionThermalPrint` / `PrecisionA4SheetPrint`).
- Before each precision `window.print()` call (the two locations near L3808 and L3926, and the test-label print path), set `setPrintPageActive(true)` then call `window.print()` on the next tick (`requestAnimationFrame` or microtask) so the `<style>` is in the DOM before the print dialog opens. Add the same 1500ms safety timeout already used for standard mode to reset the flag if `afterprint` doesn't fire.

### 3. `PrecisionThermalPrint.tsx` / `PrecisionA4SheetPrint.tsx`

These also render `<PrecisionPrintCSS ... />` internally. Add the same `active` prop pass-through so the gate works regardless of which path renders the CSS. Default `active` to `false` so existing callers don't accidentally inject the style.

## Verification

1. Reload, open POS, print a thermal receipt → confirm full 80mm receipt prints correctly.
2. Open Barcode Printing → Precision Pro tab, print a label → confirm labels still print at correct size.
3. Without reloading, switch back to POS and print another thermal receipt → confirm it is no longer blank/shrunken.
4. Inspect `document.head` after each print → confirm `#precision-print-css` is absent when no precision print is in flight.
5. Repeat in both Chrome and Edge.
6. not after barcode print even new session show this issue

## Out of scope

- `PrintPreviewDialog.tsx` `pageStyle` (already correct).
- `barcodePrinter.ts`, `barcodeDesktopPrint.ts`, `thermalReceiptPrintDocument.ts` (each writes into an isolated print document/window, no leak).
- The standard-tab `<style>` gating from the previous fix (already in place; this plan only adds the precision-tab equivalent).