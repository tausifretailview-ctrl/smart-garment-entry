

## Problem: Stock Settlement Shows Wrong Stock Quantities

### Root Causes Identified

1. **Default 1000-row limit**: The query fetches variants without pagination, so Supabase returns only the first 1000 rows. The screenshot confirms "0/1000" — the user has more than 1000 variants but only 1000 are loaded.

2. **Missing `products.deleted_at IS NULL` filter**: Stock Report excludes deleted products; Stock Settlement does not, potentially including soft-deleted products.

3. **Missing direct `organization_id` filter on `product_variants`**: Stock Report uses `.eq("organization_id", currentOrganization.id)` directly on `product_variants`. Stock Settlement only filters via the joined `products.organization_id`, which may behave differently.

### Fix Plan

**File: `src/pages/StockSettlement.tsx`** — Update the data loading function:

1. **Add paginated fetch loop** (same pattern as Stock Report): Fetch in batches of 1000 using `.range(offset, offset + PAGE_SIZE - 1)` until all rows are loaded.

2. **Add `.eq("organization_id", currentOrganization.id)`** directly on `product_variants` (matching Stock Report).

3. **Add `.is("products.deleted_at", null)`** filter to exclude soft-deleted products.

4. **Update the counter display** to show the actual total count instead of being capped at 1000.

### Technical Detail

Replace the single query (lines ~117-127) with a while-loop pattern:
```
const allVariants = [];
const PAGE_SIZE = 1000;
let offset = 0;
let hasMore = true;

while (hasMore) {
  const { data } = await supabase
    .from("product_variants")
    .select(...)
    .eq("organization_id", currentOrganization.id)  // direct filter
    .eq("active", true)
    .is("deleted_at", null)
    .is("products.deleted_at", null)                 // exclude deleted products
    .neq("products.product_type", "service")
    .range(offset, offset + PAGE_SIZE - 1);

  allVariants.push(...(data || []));
  offset += PAGE_SIZE;
  hasMore = (data?.length || 0) === PAGE_SIZE;
}
```

This ensures Stock Settlement loads the exact same dataset as Stock Report, producing matching totals.

