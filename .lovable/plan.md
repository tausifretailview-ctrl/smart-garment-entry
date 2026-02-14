

## Add "Copy from Existing Product" to Purchase Bill's Product Entry Dialog

### What This Does
When you click "Add New Product" from the Purchase Entry screen, the floating product creation dialog will now include a "Copy from Existing Product" search bar at the top. You can search for a similar product, select it, and all details (brand, category, style, HSN, GST, size group, colors, prices) will auto-fill. You then just change the product name, generate new barcodes, and save.

### User Flow

```text
1. In Purchase Entry, click "Add New Product" button
2. Product Entry Dialog opens
3. Type in the "Copy from Existing Product" search bar
4. Select a matching product from the dropdown
5. Form auto-fills: brand, category, style, HSN, GST, size group, colors, prices
6. Variants (sizes) are populated with prices but empty barcodes
7. Change the product name
8. Click "Generate Barcodes" for fresh barcodes
9. Save the product -- it auto-opens the size grid in Purchase Entry
```

### Changes

**File: `src/components/ProductEntryDialog.tsx`**

1. Add "Copy from Existing Product" search state (query, results, dropdown visibility) and a debounced search against `products` table
2. Add a search input with dropdown at the top of the dialog (above Product Name field)
3. On selecting a product:
   - Fetch full product details with variants from the database
   - Set `formData` fields: `category`, `brand`, `style`, `hsn_code`, `gst_per`, `size_group_id`, `default_pur_price`, `default_sale_price`, `default_mrp`, `colors`, `uom`
   - Set `variants` array from the source product's variants with prices but empty barcodes and zero opening stock
   - Auto-show the variants table
   - Leave `product_name` empty so user must enter a new name
   - Focus the product name field

### Technical Details

- Search query: debounced 300ms, queries `products` table matching `product_name`, `brand`, or `category` with `ilike`, filtered by `organization_id` and `deleted_at IS NULL`, limited to 20 results
- On selection: fetches full product with `product_variants(*)` join, maps variants with `barcode: ""` and `opening_qty: 0`
- Colors are extracted from unique variant colors of the source product
- The search dropdown uses a portal-based popover matching the existing UI patterns
- Reuses the same reset logic already in the dialog, just populates fields after reset
