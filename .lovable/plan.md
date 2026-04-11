

## Fix: Stock Report — Product Limit & Cascading Filters

### Problem
1. **1000-row cap**: The `cachedFilterOptions` query fetches products and variants without pagination, so PostgREST silently truncates at 1000 rows — orgs with more products see an incomplete product name dropdown.
2. **No cascading**: Selecting a product name auto-fills brand/category/department but the dropdown *options* for all filters still show every value across all products. Size and color dropdowns never narrow because `rawProducts` doesn't carry variant data.

### Plan

**File: `src/pages/StockReport.tsx`**

#### 1. Update `filterOptions` state to include product IDs and variant mapping
- Add `id` to `rawProducts` type: `Array<{ id: string; product_name: string; brand: string; category: string; style: string }>`
- Add `variantsByProductId: Record<string, { sizes: string[]; colors: string[] }>`

#### 2. Paginate the `cachedFilterOptions` query (lines 153-177)
- Replace the single `supabase.from("products").select(...)` call with a `while(hasMore)` loop fetching 1000 rows at a time using `.range()` — same pattern already used elsewhere in this file (e.g., line 275).
- Include `id` in the select: `.select("id, product_name, brand, category, style")`
- Do the same for the variants query: paginate `.select("product_id, size, color")` in batches of 1000.
- Build `variantsByProductId` map from variant results.
- Return it alongside existing fields.

#### 3. Paginate `fetchFilterOptions()` (lines 200-260) with the same pattern
- This is the non-cached fallback. Apply identical pagination and include `id` + `product_id` selects.

#### 4. Add `derivedFilterOptions` useMemo
- When `productNameFilter` is set: filter `rawProducts` by name, narrow brands/categories/departments to only matching products, narrow sizes/colors from `variantsByProductId`.
- When no product selected: return full `filterOptions` lists.

#### 5. Update product name `onValueChange` handler (lines 1312-1323)
- Reset all dependent filters (brand, category, department, size, color) to `"all"`.
- If only one value exists in the narrowed set, auto-select it.

#### 6. Update all filter dropdowns (lines 1329-1348) to use `derivedFilterOptions`
- Brand → `derivedFilterOptions.brands`
- Category → `derivedFilterOptions.categories`
- Department → `derivedFilterOptions.departments`
- Size → `derivedFilterOptions.sizes`
- Color → `derivedFilterOptions.colors`

### No changes to
- Stock data fetch query, `filteredStockItems` logic, `multiTokenMatch`, export/print, `SearchableSelect` component, or any other file.

