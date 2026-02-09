
# Fix Plan: Purchase Bill Excel Import - Duplicate Variant Error

## Problem Identified

The Excel import is showing "28 errors" because all rows fail with **duplicate key constraint violations** on `product_variants_active_product_color_size_idx`. 

### Root Cause Analysis

Looking at the database logs and the import logic:

1. **Unique Constraint**: The database has a unique index on `(product_id, color, size)` for active variants
2. **Variant Lookup Bug**: The current import logic looks up variants by `productId|size` (line 2081) but doesn't check if the variant already exists including color
3. **Result**: When importing, if a variant already exists but the lookup key doesn't match exactly, the code tries to INSERT a new variant, which violates the unique constraint

### Your Excel File Structure

| Product Name | Size | Purchase PKR | Purchasr Price | Sale Price |
|-------------|------|--------------|----------------|------------|
| GA-M015 | BDS | 4,200 | 1,693 | 3,000 |
| KH-M0277 | 12 | 4,700 | 1,863 | 3,200 |
| ... | ... | ... | ... | ... |

The import is correctly mapping columns, but failing during variant creation/lookup.

---

## Solution

### 1. Fix Variant Lookup to Include Color

The variant lookup key should include color to properly match existing variants:

```typescript
// Current (broken):
const variantKey = `${productId}|${size?.toLowerCase()}`;

// Fixed:
const variantKey = `${productId}|${color?.toLowerCase() || ''}|${size?.toLowerCase()}`;
```

### 2. Use UPSERT Instead of INSERT for Variants

When creating a new variant, use `onConflict` to handle duplicates gracefully:

```typescript
const { data: newVariant, error: variantError } = await supabase
  .from('product_variants')
  .upsert({
    organization_id: currentOrganization.id,
    product_id: productId,
    size: size,
    color: color || null,
    barcode: barcode,
    pur_price: parseLocalizedNumber(row.pur_price),
    sale_price: parseLocalizedNumber(row.sale_price),
    stock_qty: 0,
    active: true,
  }, {
    onConflict: 'product_id,color,size',  // Match the unique index
    ignoreDuplicates: false,  // Update if exists
  })
  .select('id')
  .single();
```

### 3. Pre-fetch Variants Including Color in Key

Update the variant pre-fetch to build keys that include color:

```typescript
// Pre-fetch existing variants with color
const { data: existingVariants } = await supabase
  .from('product_variants')
  .select('id, product_id, size, barcode, color')
  .eq('organization_id', currentOrganization.id)
  .in('product_id', productIds.length > 0 ? productIds : ['']);

// Build variant map including color
(existingVariants || []).forEach(v => {
  const key = `${v.product_id}|${(v.color || '').toLowerCase()}|${v.size?.toLowerCase()}`;
  variantMap.set(key, { id: v.id, barcode: v.barcode || '' });
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PurchaseEntry.tsx` | Fix variant lookup key to include color; use upsert for variant creation |

---

## Code Changes Summary

1. **Line ~2024-2034**: Update variant pre-fetch to include `color` in the select and build keys with color
2. **Line ~2080-2082**: Update variant lookup key to include color
3. **Line ~2101-2114**: Change variant INSERT to UPSERT with conflict handling on `product_id,color,size`

---

## Impact

- **Low risk**: Only affects Excel import for purchase bills
- **Backwards compatible**: Existing imports that worked will continue to work
- **Fixes the issue**: Products with existing variants will be found correctly; new variants will be created only when truly new

---

## Testing After Fix

1. Re-import the Maliha_CRTN51.xlsx file
2. Expected result: All 28 items should import successfully
3. The system will either:
   - Find existing variants and add line items (no duplicate errors)
   - Create new variants only for truly new product/color/size combinations
