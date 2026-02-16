
# Fix: Product Not Found in Sale Order / Field Sales Search

## Problem
ROLEX products (brand: OXER, KS Footwear organization) appear correctly in the Size Stock report but fail to show in the Sale Order product search. The data is verified to exist in the database with stock available.

## Root Cause
The **Field Sales (SalesmanOrderEntry)** product search query is too narrow:

**Current search (line 292):**
```
.or(`product_name.ilike.%${term}%,style.ilike.%${term}%`)
```

It only searches `product_name` and `style` -- missing `brand`, `category`, `color`, and `barcode`. Additionally, there is no debounce on search input, causing potential race conditions on slow networks.

## Fix Plan

### File: `src/pages/salesman/SalesmanOrderEntry.tsx`

**1. Expand product search to include `brand` and `category`**

Change line 292 from:
```
.or(`product_name.ilike.%${term}%,style.ilike.%${term}%`)
```
To:
```
.or(`product_name.ilike.%${term}%,style.ilike.%${term}%,brand.ilike.%${term}%,category.ilike.%${term}%`)
```

**2. Add search debounce (300ms)**

Replace the direct `searchProducts(e.target.value)` call in the input onChange with a debounced version using `useEffect` + `setTimeout`, matching the pattern used in the regular Sale Order Entry.

**3. Add multi-term client-side filtering**

After fetching results, apply client-side filtering so searches like "rolex bk.red" or "rolex gray 7" work by matching all space-separated terms against the combined product name, brand, color, size, and barcode fields.

**4. Include variant-level `color` search in the database query**

Add `color.ilike.%${term}%` to the variant query's `.or()` filter so searching by color name directly returns matching variants.

### Summary of Changes

| Change | Detail |
|--------|--------|
| Expand product `.or()` filter | Add `brand`, `category` fields |
| Add variant `color` search | Add color to variant `.or()` filter |
| Add debounce | 300ms delay before search fires |
| Multi-term filtering | Client-side filter for space-separated terms |
| File affected | `src/pages/salesman/SalesmanOrderEntry.tsx` |
