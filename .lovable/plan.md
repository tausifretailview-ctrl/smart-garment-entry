

# Plan: Fix "No Unique Constraint Matching ON CONFLICT" Error

## Problem Analysis

The recent migration to fix duplicate NULL color variants replaced a **unique constraint** with a **unique index**:
- Removed: `product_variants_product_id_color_size_key` (UNIQUE CONSTRAINT)
- Added: `product_variants_product_color_size_unique` (UNIQUE INDEX with COALESCE)

**Why this causes the error:**
PostgreSQL's `.upsert()` with `onConflict: "product_id,color,size"` requires a **constraint** that exactly matches those column names. The new index uses `COALESCE(color, '')` which doesn't match.

**Organizations affected:** All organizations that try to save products after the migration.

---

## Solution

Add a unique constraint alongside the existing index. The constraint will handle the ON CONFLICT clause, while the index continues to prevent NULL duplicates.

### Database Changes

```sql
-- Add unique constraint for ON CONFLICT support
-- This uses a trick: create a partial unique constraint that excludes deleted records
ALTER TABLE product_variants 
ADD CONSTRAINT product_variants_product_color_size_key 
UNIQUE NULLS NOT DISTINCT (product_id, color, size);
```

**Key:** PostgreSQL 15+ supports `NULLS NOT DISTINCT` which treats NULL values as equal for uniqueness. This means `(product_id, NULL, 'Free')` can only exist once.

**If PostgreSQL version < 15:** We'll need to modify the frontend code to use a different approach (check-then-insert instead of upsert).

---

## Alternative (If NULLS NOT DISTINCT not supported)

If the database doesn't support `NULLS NOT DISTINCT`, we'll modify the frontend code:

### Frontend Code Changes

**File:** `src/pages/ProductEntry.tsx`

Replace `.upsert()` with explicit duplicate checking:

```typescript
// Instead of:
await supabase.from("product_variants").upsert(variants, {
  onConflict: "product_id,color,size",
});

// Use:
for (const variant of variants) {
  const { data: existing } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", variant.product_id)
    .eq("size", variant.size)
    .is("deleted_at", null)
    // Handle NULL color comparison
    .or(`color.eq.${variant.color || ''},color.is.null`)
    .maybeSingle();

  if (existing) {
    // UPDATE existing variant
    await supabase.from("product_variants")
      .update({ ...variant })
      .eq("id", existing.id);
  } else {
    // INSERT new variant
    await supabase.from("product_variants")
      .insert([variant]);
  }
}
```

---

## Recommended Approach

1. **First attempt:** Add the `NULLS NOT DISTINCT` constraint (cleanest solution)
2. **Fallback:** If database version doesn't support it, modify frontend code

---

## Implementation Steps

| Step | Action |
|------|--------|
| 1 | Create database migration to add unique constraint with `NULLS NOT DISTINCT` |
| 2 | If Step 1 fails, update ProductEntry.tsx to replace `.upsert()` with check-then-insert/update logic |
| 3 | Test product creation in affected organizations |

---

## Technical Notes

The existing unique index `product_variants_product_color_size_unique` will remain in place - it provides:
- Fast lookups on the composite key
- Prevents duplicates where soft-deleted records exist

The new constraint provides:
- ON CONFLICT clause support for upsert operations
- Proper NULL handling with NULLS NOT DISTINCT

