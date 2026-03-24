

## Add Per-Organization Barcode Mode Setting (Auto vs Scan/Manual)

### Overview
Add a setting under Purchase Settings so organizations using manufacturer/supplier barcodes can disable auto-generation. When set to "Scan/Manual", barcode fields stay blank for users to scan or type barcodes.

### Changes

**1. Settings Page — Add barcode mode selector** (`src/pages/Settings.tsx`)
- Add `barcode_mode` to `PurchaseSettings` interface
- Add a Select dropdown in the Purchase tab (after default tax rate) with two options: "Auto Generate" and "Scan / Manual"
- Stored in `purchase_settings.barcode_mode`, defaults to `"auto"`

**2. ProductEntryDialog — Respect barcode mode** (`src/components/ProductEntryDialog.tsx`)
- Add `isAutoBarcode?: boolean` prop (default `true`)
- Guard the `autoBarcodePending.current = true` assignments — only set when `isAutoBarcode` is true
- Guard the `useEffect` that auto-generates barcodes on variant creation — skip when `isAutoBarcode` is false
- Update the "Regenerate Barcodes" button visibility — only show when `isAutoBarcode` is true
- In scan mode, barcode fields remain blank for manual entry

**3. PurchaseEntry — Read setting and pass to dialog** (`src/pages/PurchaseEntry.tsx`)
- Read `barcode_mode` from `settings.purchase_settings`
- Derive `isAutoBarcode = barcodeMode !== 'scan'`
- Pass `isAutoBarcode` prop to `<ProductEntryDialog>`
- Guard the existing `generateCentralizedBarcode()` calls in the size grid handler (lines 1384, 1427) — skip auto-generation when `isAutoBarcode` is false; in scan mode, variants without barcodes are added as-is (barcode stays blank or whatever the user typed)
- Add a warning confirmation when saving a product with blank barcode in scan mode

**4. Barcode field UI hint** (`src/components/ProductEntryDialog.tsx`)
- Show a small badge next to the Barcode label: blue "Auto" or orange "Scan/Manual"
- In scan mode, show placeholder "Scan barcode or type manually..." instead of auto-generated value
- In scan mode, barcode input gets focus-friendly orange border styling when empty

### What stays unchanged
- POS barcode scan lookup — works the same since scan-mode products will have manufacturer barcodes stored
- QuickAddProductDialog — unchanged (uses its own flow)
- Product Entry standalone page — unchanged for now

