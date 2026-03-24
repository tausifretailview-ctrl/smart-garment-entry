

## Fix: Barcode Scan in Size Stock Should Show All Sizes Like Name Search

### Problem
When a barcode is scanned in the Size Stock dialog, only the single product record owning that barcode is found. This means if the product has multiple color entries (each a separate `products` row), only one color's stock is shown. In contrast, searching by product name finds ALL matching product records and groups them, showing complete stock across all colors/sizes.

### Root Cause
In `SizeStockDialog.tsx` (lines 97-135), the barcode search finds the variant, extracts its parent product, but does NOT search for sibling products sharing the same name+brand. The name search (lines 142-154) does find all of them because it uses `product_name.ilike`.

### Fix
**File: `src/components/SizeStockDialog.tsx`**

After the barcode search finds matching products (line 135), add a secondary query to find ALL products with the same `product_name` and `brand` as the barcode-matched products. This ensures that scanning barcode "100001207" for "JEANS-FULL-TEST-6" will also pull in all other color entries of that product, just like a name search would.

Specifically, after building `barcodeProducts` map:
1. Extract unique product names from barcode results
2. Query `products` table for all records matching those names (same org, not deleted)
3. Add those products to `barcodeProducts` map before merging

This way the barcode scan behaves identically to a name search — the user sees the full size grid across all colors.

