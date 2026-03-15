

## Fix: Stock Report search not returning product name results

### Problem
When searching by product name (e.g. "Pul175") in the Stock Report, no results appear because:
1. The search "Pul175" matches the barcode heuristic (has digits, length ≥ 5), so only `barcode` columns are searched at DB level
2. Even for pure text searches, no DB-level product name filter is applied — it relies on client-side filtering of paginated data, which misses products not in the fetched page

### Fix (single block change)
In `src/pages/StockReport.tsx` lines 433–444, replace the barcode-only DB filter with a broader `.or()` that always searches barcode, size, color, **and** product name/brand on the joined `products` table.

**Remove** the `looksLikeBarcode` gate entirely. **Replace** the `.or()` call to include `products.product_name.ilike` and `products.brand.ilike` using dot notation (works with `!inner` joins in PostgREST):

```typescript
// Apply search filter at query level - search by barcode, size, color AND product name
if (searchTerm.trim()) {
  const search = searchTerm.trim();
  query = query.or(
    `barcode.eq.${search},barcode.ilike.%${search}%,size.ilike.%${search}%,color.ilike.%${search}%,products.product_name.ilike.%${search}%,products.brand.ilike.%${search}%`
  );
}
```

**Note:** The user's proposed syntax with `{ referencedTable: 'products' }` would incorrectly apply ALL conditions (including barcode/size/color) to the products table. The correct approach is dot notation without `referencedTable`, which works because `products` is joined via `!inner`.

### Scope
- **One file**: `src/pages/StockReport.tsx`
- **One block**: lines 433–444 (the search filter section)
- No other logic, filters, UI, or client-side filtering changes

