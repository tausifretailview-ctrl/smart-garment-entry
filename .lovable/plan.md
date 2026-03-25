

## Fix: Barcode Handling Based on Barcode Mode Setting

### Problem
The recent change always auto-generates barcodes in purchase context, even when barcode mode is set to "Scan/Manual". The correct behavior:
- **Auto Generate mode**: Auto-generate barcodes at save time (current behavior) — works correctly
- **Scan/Manual mode**: Require user to scan/enter barcode — block "Add to Bill" if any variant has an empty barcode, show a clear message to scan

### Fix — `src/components/ProductEntryDialog.tsx`

**In `handleSave` (lines ~928-946):**

1. Wrap the auto-generation loop (lines 928-934) with an `if (isAutoBarcode)` check so it only runs in auto mode
2. Keep the "missing barcode" validation block (lines 937-946) for **both modes** — but customize the toast message:
   - Auto mode: This path should never trigger (barcodes just got generated), but kept as safety net
   - Scan/Manual mode: Show "Please scan or enter barcode for all variants before adding to bill"

```
if (hideOpeningQty) {
  if (isAutoBarcode) {
    // Auto mode: generate barcodes for any missing
    for (let i = 0; i < variantsToCreate.length; i++) {
      if (!variantsToCreate[i].barcode) {
        variantsToCreate[i] = { ...variantsToCreate[i], barcode: await generateSequentialBarcode() };
      }
    }
  }
}

// Block save if any variant still has no barcode
const missingBarcode = variantsToCreate.some(v => !v.barcode || !v.barcode.trim());
if (missingBarcode) {
  toast({
    title: "Barcode Required",
    description: isAutoBarcode
      ? "Failed to generate barcodes. Please try again."
      : "Please scan or enter barcode for all variants before adding to bill",
    variant: "destructive",
  });
  setLoading(false);
  return;
}
```

This is a ~5 line change in one file. No other files affected.

