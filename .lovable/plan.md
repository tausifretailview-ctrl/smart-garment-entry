

## Auto-Fill Product Entry from Existing Product

### What This Does
Adds a "Copy from Existing" search field at the top of the Product Entry form. When you search and select an existing product, all details (brand, category, style, HSN, GST, size group, colors, sizes, prices) are auto-filled into the form. You only need to change what's different (like the product name) and click "Generate Barcodes" for new barcodes, then save.

### User Flow

```text
1. Open Product Entry to add a new product
2. Type in the "Copy from existing product" search field
3. Select a matching product from the dropdown
4. Form auto-fills: brand, category, style, HSN, GST, size group, colors
5. Variants (sizes) are generated with prices from the source product
6. User changes the product name and any other fields as needed
7. Click "Generate Barcodes" to get fresh barcodes for the new product
8. Save the product
```

### Changes

**File: `src/pages/ProductEntry.tsx`**

1. Add a "Copy from Existing" search input above the Product Name field (only shown when creating a new product, not when editing)
2. Add state for the search query and a dropdown of matching products
3. On selecting a product:
   - Fetch the product with its variants from the database
   - Set `formData` fields: `category`, `brand`, `style`, `hsn_code`, `gst_per`, `size_group_id`, `default_pur_price`, `default_sale_price`, `default_mrp`, `colors`, `uom`
   - Set `variants` array from the source product's variants (all sizes/colors with prices) but with empty barcodes and zero opening stock
   - Auto-show the variants table
   - Leave `product_name` empty so user must enter a new name
4. The search uses a debounced query against the `products` table filtered by organization, matching on `product_name` or `brand`

### Technical Details

- Search query: `supabase.from("products").select("id, product_name, brand, category").ilike("product_name", "%search%").eq("organization_id", orgId).is("deleted_at", null).limit(20)`
- On selection: `supabase.from("products").select("*, product_variants(*)").eq("id", selectedId).single()` to get full details
- Variants are copied with `barcode: ""` and `opening_qty: 0` so user generates fresh barcodes
- The markup percentage is recalculated from the copied purchase/sale prices
- This feature is hidden when `editingProductId` is set (edit mode)
- Uses a simple dropdown with `datalist`-style results, matching the compact UI style of the existing form

