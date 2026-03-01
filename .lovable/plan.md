

# Add Duplicate Barcode Detection to Purchase Entry and Quick Add Product

## Overview
Currently, only the full Product Entry page validates barcode uniqueness before saving. The Purchase Entry and Quick Add Product dialogs skip this check, allowing duplicate barcodes to slip into the database. This plan adds barcode uniqueness validation to both entry points.

## Changes

### 1. Create a shared barcode validation utility
**New file: `src/utils/barcodeValidation.ts`**

Extract a reusable async function that checks if a barcode already exists in `product_variants` (excluding a given variant ID for edit scenarios):

```typescript
export async function checkBarcodeExists(barcode: string, excludeVariantId?: string): Promise<{exists: boolean, productName?: string}>
```

This queries the database for any active variant with the same barcode and returns the conflicting product name if found.

### 2. Quick Add Product Dialog
**File: `src/components/mobile/QuickAddProductDialog.tsx`**

Before inserting the new variant, call `checkBarcodeExists(barcode)`. If a duplicate is found, show a toast error like: *"Barcode X already exists in product Y. Please use a unique barcode."* and abort the save.

### 3. Purchase Entry -- New variant creation path
**File: `src/pages/PurchaseEntry.tsx`**

In the Excel import flow and manual entry flow where new variants are created with user-provided barcodes, add a `checkBarcodeExists()` call before inserting. If a conflict is found, warn the user but allow them to proceed (since Purchase Entry often works with existing barcodes for receiving stock).

---

## Technical Details

- The utility will query `product_variants` with `deleted_at IS NULL` filter and join to `products` to get the product name
- Organization-scoped: filter by `organization_id` to only flag duplicates within the same organization
- The check is lightweight (single indexed query) and won't slow down the entry flow
- Purchase Entry will show a warning toast (non-blocking) since receiving goods against existing barcodes is valid; Quick Add will block the save since it's creating a brand new product

