-- Step 1: Identify duplicates and their original variants
CREATE TEMP TABLE variant_duplicates AS
WITH ranked AS (
  SELECT 
    id,
    product_id,
    COALESCE(color, '') as color_key,
    size,
    stock_qty,
    ROW_NUMBER() OVER (
      PARTITION BY product_id, COALESCE(color, ''), size 
      ORDER BY created_at ASC
    ) as rn
  FROM product_variants
  WHERE deleted_at IS NULL
)
SELECT 
  r.id as duplicate_id,
  r.stock_qty as duplicate_stock,
  o.id as original_id
FROM ranked r
JOIN ranked o ON o.product_id = r.product_id 
  AND o.color_key = r.color_key 
  AND o.size = r.size
  AND o.rn = 1
WHERE r.rn > 1;

-- Step 2: Update FK references (excluding batch_stock which needs special handling)
UPDATE purchase_items SET sku_id = vd.original_id FROM variant_duplicates vd WHERE sku_id = vd.duplicate_id;
UPDATE sale_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE quotation_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE sale_order_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE sale_return_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE purchase_return_items SET sku_id = vd.original_id FROM variant_duplicates vd WHERE sku_id = vd.duplicate_id;
UPDATE delivery_challan_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE purchase_order_items SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;
UPDATE stock_movements SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;

-- Step 3: Handle batch_stock - merge quantities where bill_number exists for original
UPDATE batch_stock bs_orig
SET quantity = bs_orig.quantity + bs_dup.quantity
FROM batch_stock bs_dup
JOIN variant_duplicates vd ON bs_dup.variant_id = vd.duplicate_id
WHERE bs_orig.variant_id = vd.original_id
  AND bs_orig.bill_number = bs_dup.bill_number;

-- Step 4: Delete batch_stock records that were merged (matching bill_number)
DELETE FROM batch_stock bs
USING variant_duplicates vd
WHERE bs.variant_id = vd.duplicate_id
  AND EXISTS (
    SELECT 1 FROM batch_stock bs2 
    WHERE bs2.variant_id = vd.original_id AND bs2.bill_number = bs.bill_number
  );

-- Step 5: Update remaining batch_stock (non-matching bill_number) to point to original
UPDATE batch_stock SET variant_id = vd.original_id FROM variant_duplicates vd WHERE variant_id = vd.duplicate_id;

-- Step 6: Consolidate stock from duplicates to originals
UPDATE product_variants pv
SET stock_qty = pv.stock_qty + agg.total_stock, updated_at = NOW()
FROM (SELECT original_id, SUM(duplicate_stock) as total_stock FROM variant_duplicates GROUP BY original_id) agg
WHERE pv.id = agg.original_id;

-- Step 7: Soft-delete duplicate variants
UPDATE product_variants pv SET deleted_at = NOW() FROM variant_duplicates vd WHERE pv.id = vd.duplicate_id;

-- Step 8: Drop temp table
DROP TABLE variant_duplicates;

-- Step 9: Drop the existing unique constraint
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_product_id_color_size_key;

-- Step 10: Create a new unique index with COALESCE for NULL handling
CREATE UNIQUE INDEX product_variants_product_color_size_unique 
ON product_variants (product_id, COALESCE(color, ''), size)
WHERE deleted_at IS NULL;