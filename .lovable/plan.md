

# Plan: Fix Duplicate Product Variants with NULL Color

## Problem Identified

The system allows creating duplicate product variants because of **PostgreSQL's NULL handling in unique constraints**. 

In PostgreSQL:
- `NULL != NULL` evaluates to true (not equal)
- The unique constraint `UNIQUE (product_id, color, size)` does NOT prevent duplicates when `color` is NULL

**Your specific case:**
| Variant ID | Product ID | Size | Color | Barcode | Created |
|------------|------------|------|-------|---------|---------|
| b8e1b425... | e447bc7e... | Free | NULL | 8906016102610 | Jan 20 |
| d48a2f9f... | e447bc7e... | Free | NULL | 8906016102610 | Jan 26 06:50 |
| e57e5790... | e447bc7e... | Free | NULL | 8906016102610 | Jan 26 08:13 |

All three have the same product_id, size, and NULL color - but PostgreSQL's unique constraint doesn't block this.

---

## Solution

### 1. Database: Create Proper Unique Index

Replace the current unique constraint with a unique index that uses `COALESCE` to treat NULL as an empty string:

```sql
-- Drop the existing unique constraint
ALTER TABLE product_variants 
DROP CONSTRAINT IF EXISTS product_variants_product_id_color_size_key;

-- Create a new unique index that properly handles NULL values
CREATE UNIQUE INDEX product_variants_product_color_size_unique 
ON product_variants (product_id, COALESCE(color, ''), size)
WHERE deleted_at IS NULL;
```

This ensures:
- NULL color treated as empty string for uniqueness check
- Only active (non-deleted) variants are checked
- Prevents duplicate variants regardless of NULL values

### 2. Clean Up Existing Duplicates

Before applying the new constraint, we need to remove or merge the duplicate variants:

```sql
-- Identify duplicates (keep the oldest, delete newer ones)
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, COALESCE(color, ''), size 
      ORDER BY created_at ASC
    ) as rn
  FROM product_variants
  WHERE deleted_at IS NULL
)
-- Delete duplicate variants (keep first one)
DELETE FROM product_variants 
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
```

### 3. Frontend: Improve Barcode Validation

Update the barcode uniqueness check in `ProductEntry.tsx` to catch this scenario earlier:

**File:** `src/pages/ProductEntry.tsx`

Add a check in `validateBarcodeUniqueness` to also verify within the same product that no two variants share the same barcode.

---

## Technical Details

### Why This Happened

When editing/re-saving the product "MANGO SHRIKAND 250", the upsert operation:
```typescript
.upsert(variantsToInsert, {
  onConflict: "product_id,color,size",
})
```

Failed to match existing rows because:
1. Existing variant has `color = NULL`
2. New variant being inserted has `color = NULL`
3. PostgreSQL's ON CONFLICT doesn't match because `NULL != NULL`
4. Result: INSERT instead of UPDATE, creating duplicates

### Database Migration Required

The fix requires a database migration to:
1. Clean up existing duplicates (merge stock_qty to the original)
2. Drop the old unique constraint
3. Create the new unique index with COALESCE

### Risk Assessment

- **Low Risk**: The change only affects uniqueness checking
- **Data Impact**: Duplicate variants will be removed (stock consolidated)
- **Rollback**: Can revert to old constraint if needed

---

## Summary

| Component | Change |
|-----------|--------|
| Database | Create unique index with COALESCE for NULL handling |
| Database | Clean up existing duplicate variants |
| ProductEntry.tsx | Enhance barcode validation to catch duplicates |

This fix ensures that variants like `(product_id, NULL, 'Free')` cannot be duplicated, matching the expected business behavior.

