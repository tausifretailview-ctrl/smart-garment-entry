

## Merge Color Consolidation

### Problem
The current `merge_products` function moves variants but does **not** update the parent product's `color` field. After merging PUL175:
- **Target product** `color` = "BK" (only its original color)
- **Source product** `color` = "BLU"
- **Actual variant colors**: BK, BLU, BLUE, BR, PINK

The target product's color list becomes incomplete and out of sync with its variants.

### What Will Change

After the fix, the merge function will automatically:
1. Collect all unique colors from the merged variants
2. Update the target product's `color` field with the combined, deduplicated list (e.g., "BK, BLU, BLUE, BR, PINK")
3. Ensure the Product Dashboard and all search/filter screens reflect the correct colors

### Technical Details

**Update the `merge_products` database function** to add a color consolidation step between moving variants and soft-deleting the source:

```text
-- After moving variants (step 1), before soft-delete (step 5):
-- Rebuild target product's color from all its variants
UPDATE products
SET color = (
  SELECT STRING_AGG(DISTINCT v.color, ', ' ORDER BY v.color)
  FROM product_variants v
  WHERE v.product_id = p_target_product_id
    AND v.deleted_at IS NULL
    AND v.color IS NOT NULL
    AND v.color != ''
    AND v.color != '-'
)
WHERE id = p_target_product_id;
```

### Files to Modify
- **Database migration**: Update `merge_products` function to include color consolidation step

### Notes
- This rebuilds the color list from actual variant data, so it will be accurate even if the original product color fields were incomplete
- Near-duplicate colors (e.g., "BLU" vs "BLUE") are kept as-is since they map to different variant records -- cleaning those up is a separate data normalization task

