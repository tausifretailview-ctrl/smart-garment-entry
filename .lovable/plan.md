
# Fix Missing Products in Quotation/Sales Entry Pages

## Problem Summary

When searching for products like "LWR ARM" in Quotation Entry, not all matching products are displayed. Investigation reveals **two issues**:

1. **UI Display Limit**: The product search dropdown limits displayed results to 50 items (`.slice(0, 50)`), hiding additional matches
2. **Non-Deterministic Pagination**: Product fetching queries use `.range()` pagination without `.order()` clause, causing inconsistent results when datasets exceed 1000 rows

These issues affect multiple entry pages:
- QuotationEntry.tsx
- SaleOrderEntry.tsx  
- SalesInvoice.tsx

---

## What Will Be Changed

### 1. Add Deterministic Sorting to Pagination Queries

Add `.order("product_name").order("id")` to all product fetching queries that use `.range()` pagination:

**QuotationEntry.tsx (lines 329-335):**
```typescript
const { data, error } = await supabase
  .from('products')
  .select(`*, product_variants (*)`)
  .eq('organization_id', currentOrganization.id)
  .eq('status', 'active')
  .is('deleted_at', null)
  .order('product_name')  // Primary sort
  .order('id')            // Secondary sort for deterministic pagination
  .range(offset, offset + PAGE_SIZE - 1);
```

**Same fix applied to:**
- SaleOrderEntry.tsx (lines 343-349)
- SalesInvoice.tsx (lines 379-389)

### 2. Increase Search Results Display Limit

Change `.slice(0, 50)` to `.slice(0, 100)` in dropdown displays to show more matching products:

| File | Line | Change |
|------|------|--------|
| QuotationEntry.tsx | 1119 | `slice(0, 50)` → `slice(0, 100)` |
| SaleOrderEntry.tsx | 1318 | `slice(0, 50)` → `slice(0, 100)` |

### 3. Increase Inline Search Limit (QuotationEntry)

Change `.limit(50)` to `.limit(100)` for the inline search query:

**QuotationEntry.tsx (line 722):**
```typescript
const { data } = await variantsQuery.limit(100);  // Was limit(50)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/QuotationEntry.tsx` | Add `.order()` to products query, increase slice limit to 100, increase inline search limit to 100 |
| `src/pages/SaleOrderEntry.tsx` | Add `.order()` to products query, increase slice limit to 100 |
| `src/pages/SalesInvoice.tsx` | Add `.order()` to products query |

---

## Technical Details

### Why `.order()` is Required for Pagination

Supabase/PostgreSQL does not guarantee row order without explicit `ORDER BY`. When paginating with `.range()`:
- Page 1 fetches rows 0-999
- Page 2 fetches rows 1000-1999

Without ordering, the database may return rows in different order between calls, causing:
- Rows to be skipped (appear on neither page)
- Rows to be duplicated (appear on both pages)

Adding `.order("id")` ensures deterministic, repeatable results across all pagination pages.

### Why 100 Results vs 50

For organizations with many similar products (like 45 "LWR ARM" variants), limiting to 50 results can hide relevant items when combined with other partial matches. Increasing to 100 provides better coverage while maintaining reasonable UI performance.

---

## Result

After this fix:
- All 45 "LWR ARM" products will appear when searching "LWR ARM"
- Product lists will be consistent across page loads (no random missing products)
- Same fix applied proactively to SaleOrderEntry and SalesInvoice for consistency
