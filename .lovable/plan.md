

# Fix: Soft-Deleted Products Showing in Size Stock Report

## Problem
In `SizeStockDialog.tsx`, when loading stock data for selected products (line 214), the query filters `product_variants.deleted_at IS NULL` but does **not** filter `products.deleted_at IS NULL`. This means soft-deleted products can still appear in the Size Stock dialog with their variant data (including negative stock values like -1).

The product **search** query (line 128) correctly filters `products.deleted_at IS NULL`, but users can still see stale results if products were soft-deleted after being selected, or if they appear through barcode search which also misses the products deletion check.

## Fix

### File: `src/components/SizeStockDialog.tsx`

**Change 1 -- Stock loading query (line ~214):**
Add `.is("products.deleted_at", null)` to the stock data fetch query to exclude soft-deleted products from the results.

**Change 2 -- Barcode search query (line ~90):**
Add `.is("products.deleted_at", null)` filter to the barcode variant search. Currently it only checks `product_variants.deleted_at` but not the parent product's deletion status, so a soft-deleted product could still appear via barcode search.

Both changes add a single line each -- no structural changes needed.

