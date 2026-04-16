

## Fix: Barcode Scan Should Bypass Size Grid Dialog

**Problem**: When scanning barcode `40002315` (KS Footwear), the system opens the color/size grid dialog because `entryMode` is set to `"grid"`. But a barcode uniquely identifies a specific variant (size + color), so the grid is unnecessary — the product should be added directly.

**Root Cause**: Lines 1306 and 1336 in `SalesInvoice.tsx` check `entryMode === "grid"` and open the size grid for ALL non-MTR products, even when the barcode already resolved to an exact variant.

**Fix**: Only open the size grid when the product was found via **name/text search** (dropdown selection), not via **barcode scan**. Two changes needed:

### Changes in `src/pages/SalesInvoice.tsx`

1. **Barcode scan path (line ~1306)**: Remove the grid redirect entirely for barcode scans. When a barcode resolves to an exact variant, always add it directly — the barcode already identifies the specific size+color.

2. **`addProductToInvoice` function (line ~1336)**: This is called from the dropdown selection path. Keep the grid check here since that's where the user picks a product by name and needs the grid to choose size/color.

```
// Line 1300-1311: BEFORE
if (entryMode === "grid" && !isMtrProduct) {
  openSizeGridForProduct(foundProduct, foundVariant?.sale_price);
  ...
  return;
}

// AFTER: Remove grid redirect — barcode = exact variant, add directly
// (just delete the grid check block, keep the playSuccessBeep + addProductToInvoice below)
```

This ensures:
- Barcode scan → always adds the exact variant directly (no grid)
- Dropdown product selection → opens size grid when grid mode is enabled
- MTR products → unchanged (already bypass grid)

