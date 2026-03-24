

## Fix Label Gap & Left Margin Issues for 38x25 2-Up Labels

### Problem 1: Gap between business name and barcode
The barcode SVG container in `PrecisionLabelPreview.tsx` has a height mismatch. The container height is calculated as `barcodeHeight / 3.7795`mm but the actual barcode SVG may not fill it fully, creating visible vertical whitespace. Additionally, the container's `overflow: hidden` combined with `justify-content: center` can push the barcode down, creating a gap between the business name text above and the barcode lines.

**Fix**: Reduce the barcode container height to match the actual rendered barcode more tightly. Change the container to use `align-items: flex-start` instead of centering, and set a tighter height that eliminates dead space. Also adjust the barcode height scaling factor from `0.35` (used in preview) to match the print path proportionally.

### Problem 2: Left-side blank space on 1st label
In the `PrecisionLabelPreview` component, the label container uses `transform: translate(xOffset, yOffset)`. For the first label in 2-up mode, if any xOffset is being passed, it shifts the content right. Additionally, the barcode field's `left` position (`barcodeConfig.x ?? 1`) defaults to 1mm, creating a left margin on the barcode.

**Fix**: Ensure xOffset is 0 for both PDF and browser print paths in 2-up mode. Also verify the label config's barcode x-position is set to 0 instead of defaulting to 1mm.

---

### Technical Changes

**File: `src/components/precision-barcode/PrecisionLabelPreview.tsx`**

1. **Tighten barcode container height** — Change the print-mode barcode height from `${barcodeHeight / 3.7795}mm` to a more accurate calculation that matches JsBarcode's actual rendered height. Use `${(barcodeHeight * 0.35) / 3.7795}mm` to keep consistency with the preview scaling factor.

2. **Remove default 1mm left offset on barcode** — Change the barcode container's `left` from `barcodeConfig.x ?? 1` to `barcodeConfig.x ?? 0` so barcode starts flush left unless explicitly configured otherwise.

3. **Align barcode to top of container** — Remove vertical centering (`justifyContent: center`) from the barcode wrapper div in the config-driven path, replacing with `align-items: flex-start` so the barcode sits tight against the top with no gap.

**File: `src/pages/BarcodePrinting.tsx`** (PDF generation path)

4. **Ensure xOffset=0 in precision PDF rendering** — Already passing `xOffset: 0` in the `renderLabelToCanvas` helper (line 3523), so this is correct. Verify no other offset is applied at the grid/cell level for 2-up mode.

**File: `src/components/precision-barcode/PrecisionThermalPrint.tsx`**

5. **Verify thermal print xOffset handling** — The thermal print component passes `xOffset` and `yOffset` through to `PrecisionLabelPreview`. For 2-up, ensure these are calibration-only values that don't introduce unintended left margins on individual labels.

