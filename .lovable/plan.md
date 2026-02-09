

# Fix: Purchase Bill Excel Import - 28 Errors

## Root Causes Found

### Problem 1: Upsert Cannot Work with Expression-Based Index
The unique index on product_variants uses `COALESCE(color, '')` -- an expression:
```sql
CREATE UNIQUE INDEX product_variants_active_product_color_size_idx 
ON product_variants (product_id, COALESCE(color, ''), size) 
WHERE (deleted_at IS NULL)
```

The current code uses `.upsert({...}, { onConflict: 'product_id,color,size' })` which generates `ON CONFLICT (product_id, color, size)`. PostgreSQL cannot match this to the expression-based index, so every upsert call fails with "no unique or exclusion constraint matching the ON CONFLICT specification".

### Problem 2: Variant Pre-fetch Passes 693 UUIDs in URL
The `.in('product_id', productIds)` passes ALL 693 product IDs (the entire product catalog) as URL parameters. This creates a ~25KB URL that can fail silently, resulting in no variants being returned. When no variants are found, every row hits the broken upsert.

### Problem 3: Product Pre-fetch Missing Filters
The product query doesn't filter by `deleted_at IS NULL`, so deleted products could overwrite active product mappings in the lookup map.

---

## Solution

### Change 1: Filter products properly and only pre-fetch relevant variants
Instead of fetching ALL 693 products' variants, only pre-fetch variants for the ~28 products that appear in the Excel file.

### Change 2: Replace upsert with check-then-insert pattern
Following the existing pattern used in ProductEntry.tsx (documented in project memory), use a manual query-then-insert approach since PostgreSQL ON CONFLICT doesn't support expression-based indexes.

### Change 3: Add deleted_at filter to product pre-fetch

---

## Technical Details

### File: `src/pages/PurchaseEntry.tsx`

**Product pre-fetch (lines 2005-2008)**: Add `.is('deleted_at', null)` filter.

**Variant pre-fetch (lines 2022-2028)**: Only pass product IDs that appear in the Excel data, not all products. Batch the `.in()` call if needed.

**Variant creation (lines 2103-2121)**: Replace `.upsert()` with:
1. Query for existing variant using `product_id`, `size`, and `color` match (with COALESCE handling for null)
2. If found, use existing variant ID
3. If not found, use `.insert()` (without ON CONFLICT)

```text
Before (broken):
  supabase.from('product_variants').upsert({...}, { onConflict: 'product_id,color,size' })
  --> PostgreSQL error: no matching constraint

After (fixed):
  1. SELECT id FROM product_variants 
     WHERE product_id = X AND COALESCE(color,'') = Y AND size = Z AND deleted_at IS NULL
  2. If found -> use it
  3. If not found -> INSERT (plain insert, no conflict clause)
```

---

## Expected Result
All 28 items from the Excel should import successfully since:
- Products already exist in the database (matched by name + category)
- Most variants already exist (matched by product_id + color + size)
- New variants (e.g., GA-M015 with category "3") will be created via plain INSERT

