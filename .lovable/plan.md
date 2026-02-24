

## Merge Duplicate Products Feature

### Problem
Products with the same name (e.g., "PUL175") exist as separate entries in the database with different color variants and barcodes. You want to consolidate them into a single product row.

### Current Data for PUL175
- **Product 1**: 18 variants, 274 total stock (main entry)
- **Product 2**: 20 variants, 1 total stock (duplicate)

### Solution: Add "Merge Products" capability

#### What You Will See
1. In the Product Dashboard, when you select 2 products using checkboxes, a **"Merge Selected"** button will appear in the toolbar
2. Clicking it will show a confirmation dialog listing:
   - Which product will be kept (the one with more stock/history)
   - Which product will be merged into it
   - Summary of variants being moved
3. After confirmation, all variants, images, and transaction history from the duplicate will be reassigned to the primary product

#### Technical Details

**Step 1: Database Function (Migration)**
Create a `merge_products` database function that:
- Accepts `target_product_id` and `source_product_id`
- Moves all `product_variants` from source to target (updates `product_id`)
- Updates all 8 transaction tables (`sale_items`, `purchase_items`, `quotation_items`, `sale_order_items`, `sale_return_items`, `purchase_return_items`, `delivery_challan_items`, `purchase_order_items`) to point to the target
- Moves `product_images` to the target
- Soft-deletes the source product
- Runs in a single transaction for safety

**Step 2: Merge Dialog Component**
Create `src/components/MergeProductsDialog.tsx`:
- Shows both products side by side
- Lets user pick which to keep (defaults to the one with more stock)
- Shows variant count and stock totals for each
- Calls the database function on confirm

**Step 3: Product Dashboard Integration**
Update `src/pages/ProductDashboard.tsx`:
- Add "Merge" button that appears when exactly 2 products are selected
- Opens the merge dialog
- Refreshes the product list after successful merge

### Files to Create/Modify
- **New**: `src/components/MergeProductsDialog.tsx`
- **Modify**: `src/pages/ProductDashboard.tsx` (add merge button + dialog)
- **New migration**: `merge_products` database function

