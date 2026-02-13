

## Cascade Bulk Product Updates to Purchase Bill Items

### Problem
When you use Bulk Update to change product fields like category, brand, HSN code, GST%, or product name, the changes only apply to the `products` table. The `purchase_items` table stores its own copy of these fields (denormalized), so purchase bills still show the old values.

### Solution
After updating the `products` table, also update the matching denormalized fields in `purchase_items` (and `sale_items` where applicable) for the same product IDs.

### Field Mapping

| Bulk Update Field | purchase_items column | sale_items column |
|---|---|---|
| product_name | product_name | product_name |
| category | category | -- |
| brand | brand | -- |
| style | style | -- |
| hsn_code | hsn_code | hsn_code |
| gst_per | gst_per | gst_percent |

### Changes

**File: `src/hooks/useBulkProductUpdate.tsx`**

In the `applyUpdates` function, after each product-level update block, add corresponding updates to `purchase_items` and `sale_items`:

1. **Find & Replace** -- After updating each product, also update `purchase_items` rows where `product_id = item.id` with the same field/value (if the field exists in `purchase_items`). For `product_name` changes, also update `sale_items`.

2. **Update Field** -- After bulk updating products, run a matching update on `purchase_items` for the same product IDs with the mapped column name. If the field is `hsn_code`, also update `sale_items`. If the field is `gst_per`, also update `sale_items.gst_percent`.

3. **Update GST** -- After updating `products.gst_per`, also update `purchase_items.gst_per` and `sale_items.gst_percent` for the same product IDs.

### Technical Details

A helper mapping will translate product field names to their corresponding column names in each transaction table:

```text
purchaseItemsFieldMap = {
  product_name -> product_name
  category -> category
  brand -> brand
  style -> style
  hsn_code -> hsn_code
  gst_per -> gst_per
}

saleItemsFieldMap = {
  product_name -> product_name
  hsn_code -> hsn_code
  gst_per -> gst_percent   (note: different column name)
}
```

Each cascade update will filter by `product_id IN (affected product IDs)` and the organization's scope, ensuring only the correct records are updated. Soft-deleted transaction items (with `deleted_at`) will also be updated to maintain data consistency if they are ever restored.

