

## Plan: Fix Extra Blank Labels in Precision Pro Print

### Problem
When printing from Precision Pro (thermal mode), extra blank labels appear in the printed output even though the preview shows the correct quantity. The user's screenshot shows this in the print preview dialog.

### Root Cause
Two conflicting print stylesheets are active simultaneously:

1. **`PrecisionPrintCSS` component** — injected by `PrecisionThermalPrint`, sets `@page { size: 38mm 25mm; margin: 0 }` and makes `.precision-print-area` visible.
2. **Inline `<style>` block** at the bottom of `BarcodePrinting.tsx` — always present, sets its own `@page` size based on standard mode settings, AND makes `#printArea` visible with `page-break-after: always` on `.label-grid`.

Even though `#printArea` is an empty `<div className="hidden">` when Precision Pro is active, the conflicting `@page` sizes and the `body * { visibility: hidden }` / `#printArea * { visibility: visible }` rules from BOTH stylesheets cause the browser to generate extra blank pages.

### Fix (in `src/pages/BarcodePrinting.tsx`)

**1. Conditionally render the inline `<style>` block only when Precision Pro is NOT active**

Wrap the entire `<style>{...}</style>` block (lines ~4897–5102) so it only renders when `!precisionSettings.enabled`. This prevents conflicting `@page` and visibility rules. The `PrecisionPrintCSS` component already handles everything needed for Precision Pro printing.

**2. Alternative (if the style block is needed for non-print styling):**

Split the style block — keep non-print styles always rendered, but wrap the `@media print` section in a condition:
- When `precisionSettings.enabled` is true: skip the `@media print` block entirely (PrecisionPrintCSS handles it)
- When false: render the standard print CSS as before

This is a single conditional change in the JSX render section.

