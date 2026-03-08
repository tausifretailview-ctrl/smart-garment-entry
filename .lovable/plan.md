

## Fix Precision Pro Thermal 1-up Print Shifting

### Problem
The wrapper div applies `padding` for offsets AND reduces `width`/`height` passed to `PrecisionLabelPreview`, causing the label content to be both shifted and shrunk — smaller than the physical label. Additionally, `vGap` (vertical gap between labels on the roll) is not supported, so `@page` height doesn't account for inter-label spacing.

### Changes

**File 1: `src/components/precision-barcode/PrecisionThermalPrint.tsx`**
- Add `vGap?: number` to the interface and destructure it with default `0`
- Fix wrapper div: set height to `labelHeight + vGap` mm, remove padding/boxSizing
- Pass full `labelWidth` and `labelHeight` to `PrecisionLabelPreview` (not reduced by offsets)
- Pass `xOffset` and `yOffset` as props to `PrecisionLabelPreview` (it already supports them via `transform`)
- Pass `labelHeight + vGap` to `PrecisionPrintCSS` so `@page` size includes the gap

**File 2: `src/pages/BarcodePrinting.tsx`** (line ~5008)
- Add `vGap={precisionSettings.vGap}` prop to the `PrecisionThermalPrint` render

**File 3: `src/components/precision-barcode/PrecisionPrintCSS.tsx`**
- No changes needed — already uses `labelHeight` for `@page` size

### Technical Details

The key fix is that `PrecisionLabelPreview` already handles `xOffset`/`yOffset` internally via CSS `transform: translate(...)`. The wrapper was double-applying the offset by using padding AND shrinking the content dimensions. After the fix, the wrapper is a simple container matching the physical label+gap size, and the preview component handles positioning internally.

