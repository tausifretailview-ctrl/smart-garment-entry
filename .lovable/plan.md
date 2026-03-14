

## Fix: Auto-show Style and Supplier Code on Barcode Labels

### Problem
When printing barcodes from Purchase Dashboard, items that have `style` and `supplier_code` data don't show these fields on the label. The system already auto-enables `purchaseCode` when purchase prices exist, but lacks the same logic for `style` and `supplierCode`.

### Solution
In `src/pages/BarcodePrinting.tsx`, add auto-detection logic (similar to the existing `purchaseCode` auto-enable) that checks if any incoming purchase items have `style` or `supplier_code` values, and if so, automatically enables those fields in the label config.

### Changes

**File: `src/pages/BarcodePrinting.tsx`** (~lines 1610-1657)

In the `useEffect` that handles `location.state?.purchaseItems`:
1. Add flags `hasStyle` and `hasSupplierCode` that check if any item has non-empty values
2. After setting items, auto-enable `style.show` and `supplierCode.show` in `labelConfig` when data exists (same pattern as the existing `purchaseCode` auto-enable)

```typescript
// Existing pattern for purchaseCode:
if (hasPurchasePrices) {
  setLabelConfig(prev => ({
    ...prev,
    purchaseCode: { ...prev.purchaseCode, show: true }
  }));
}

// New: auto-enable style & supplierCode the same way
if (hasStyle) {
  setLabelConfig(prev => ({
    ...prev,
    style: { ...prev.style, show: true }
  }));
}
if (hasSupplierCode) {
  setLabelConfig(prev => ({
    ...prev,
    supplierCode: { ...prev.supplierCode, show: true }
  }));
}
```

This ensures that when data is present, the corresponding fields automatically appear on the label without requiring manual toggle.

