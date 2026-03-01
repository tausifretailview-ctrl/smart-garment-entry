

# Fix: Add Barcode Search to Product Dashboard and Improve Cross-Report Barcode Search

## Problem
When searching by barcode `0090001441` (Ella Noor / SFU-S09):
- **Product Dashboard**: Search only checks `product_name, brand, category, style` -- barcode is completely ignored
- **Stock Report**: Barcode search works but only on variant-level columns, not on product name simultaneously
- **Product Tracking**: Uses a nested `.or()` on referenced table which can be unreliable with PostgREST

The product exists correctly in the database (active, not deleted, stock_qty = 2), so this is purely a search/filter issue.

## Changes

### 1. Product Dashboard -- Add barcode search
Update the search query in `src/pages/ProductDashboard.tsx` to also search by barcode in the nested `product_variants`. When a user types a barcode, the query will also match variants whose barcode contains the search term.

Currently (line 407-408):
```typescript
if (term) {
  query = query.or(`product_name.ilike.%${term}%,brand.ilike.%${term}%,...`);
}
```

After fix: Add a secondary query path -- when the search term looks like a barcode (numeric), also search `product_variants.barcode`:
```typescript
if (term) {
  // Always search product-level fields
  query = query.or(
    `product_name.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%,style.ilike.%${term}%`
  );
}
```
Plus a separate barcode-specific fetch that merges results when the term is numeric.

### 2. Product Tracking -- Make barcode search more reliable
The current `.or()` with `referencedTable` can silently fail. Split into explicit barcode filter when search looks like a barcode number.

### 3. Stock Report -- Already works
The Stock Report search at line 431 already searches `barcode.eq` and `barcode.ilike` on the variant level, which should match. No changes needed here.

---

## Technical Details

### File: `src/pages/ProductDashboard.tsx`
- Modify the `fetchProducts` function (around line 405-409)
- When search term is provided, run two parallel queries:
  1. Original product-level search (name, brand, category, style)
  2. Barcode-level search on `product_variants` that returns matching product IDs
- Merge results and deduplicate by product ID
- This ensures barcode search works without breaking existing text search

### File: `src/pages/ProductTrackingReport.tsx`
- Around line 225-229, replace the nested `.or()` with a simpler approach:
  - If search term is numeric (looks like barcode), filter directly with `product_variants.barcode.ilike`
  - If search term is text, filter with `product_variants.products.product_name.ilike`
  - This avoids the unreliable nested OR on referenced tables
