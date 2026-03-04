

## Issues Found & Plan

### Issue 1: Business Name Not Showing in Precision Pro Preview/Print

**Root cause**: In three places, `getFieldContent("businessName", ...)` returns empty string `""`:
- `PrecisionLabelPreview.tsx` line 33
- `DraggableLabelCanvas.tsx` line 31

The business name is fetched from the `settings` table and stored in a `businessName` state variable in `BarcodePrinting.tsx`, but it's never passed to the Precision components. The Standard mode handles it correctly via `DraggablePreviewField`, but the Precision engine ignores it.

**Fix**: 
1. Add a `businessName` field to `LabelItem` type (optional string)
2. When building `labelItems` array in `BarcodePrinting.tsx`, inject the `businessName` value from settings into each item
3. Update `getFieldContent` in both `PrecisionLabelPreview.tsx` and `DraggableLabelCanvas.tsx` to read `item.businessName` instead of returning `""`
4. Update the `SAMPLE_ITEM` in `PrecisionLabelDesigner.tsx` to include a sample business name (e.g., "My Store")

### Issue 2: How to Print Labels in Precision Pro Mode

This is a user question -- I'll include a clear explanation in the response. The flow is:
1. Select products/variants and add to label list
2. Switch to "Precision Pro" tab for calibration or "Label Designer" tab for layout
3. Click "Print Labels" button -- uses browser print with exact mm-based `@page` sizing
4. Alternatively, use QZ Tray for direct thermal printing

No code changes needed for this -- just documentation/guidance.

---

### Files to Modify

1. **`src/types/labelTypes.ts`** -- Add optional `businessName?: string` to `LabelItem`
2. **`src/components/precision-barcode/PrecisionLabelPreview.tsx`** -- Update `getFieldContent` for `businessName` to return `item.businessName || ""`
3. **`src/components/precision-barcode/DraggableLabelCanvas.tsx`** -- Same fix
4. **`src/components/precision-barcode/PrecisionLabelDesigner.tsx`** -- Add `businessName: "My Store"` to `SAMPLE_ITEM`
5. **`src/pages/BarcodePrinting.tsx`** -- Inject `businessName` into each label item when building the `labelItems` array

