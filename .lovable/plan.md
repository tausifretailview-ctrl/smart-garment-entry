

## Fix: Precision Pro 38×25 2-Up — Left Label Clipping & Business Name-Barcode Gap

### Root Cause Analysis

**Left label clipping**: In `PrecisionThermalPrint.tsx`, each label cell (line 62) has `overflow: 'hidden'` and `width: labelWidth mm`. Inside, `PrecisionLabelPreview` places content using absolute positioning with `left: 0mm` (from config `x: 0`). At the exact pixel boundary, the first 1-2 characters get clipped because there's zero internal padding. The right label appears fine because flex layout gives it slightly more breathing room.

**Business name-barcode gap**: In `PrecisionLabelPreview.tsx`, the barcode container (line 176-198) is positioned at `top: u(barcodeConfig.y)` with no built-in margin from preceding text fields. Both are absolutely positioned, so there's no natural spacing.

### Changes

**1. `src/components/precision-barcode/PrecisionThermalPrint.tsx`** — Add internal padding to label cells

In the 2-Up row rendering (line 62), add `paddingLeft: '1mm'` and `paddingRight: '0.5mm'` to each label cell. Reduce content area slightly so labels don't overflow the 76.4mm printable zone. Change `overflow: 'hidden'` to `overflow: 'clip'` (same visual effect but more predictable with padding).

**2. `src/components/precision-barcode/PrecisionLabelPreview.tsx`** — Add barcode top margin

In the barcode SVG container (line 176-198), add `marginTop: '1mm'` (or `u(1)` in the unit system) as default spacing above the barcode. This creates breathing room between any text field above (like business name) and the barcode image.

**3. `src/components/precision-barcode/PrecisionPrintCSS.tsx`** — Ensure print CSS doesn't strip padding

The print CSS (line 55-56) forces `padding: 0 !important` on `.precision-print-area > div`. This targets row containers, not individual label cells. But to be safe, add a rule that preserves padding on label cell children: `.precision-print-area > div > div { padding: inherit !important; }`.

### What stays unchanged
- All label field positions, fonts, data content
- 1-Up mode, A4 sheet mode
- Label design config structure
- PDF export logic

