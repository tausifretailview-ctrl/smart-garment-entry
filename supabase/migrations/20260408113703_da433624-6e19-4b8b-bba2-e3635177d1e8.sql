-- Allow multiple variants for same product+size+color with DIFFERENT barcodes
-- This enables per-piece barcode tracking for local products
DROP INDEX IF EXISTS product_variants_active_product_color_size_idx;

CREATE UNIQUE INDEX product_variants_active_product_color_size_barcode_idx
ON product_variants (product_id, COALESCE(color, ''), size, COALESCE(barcode, ''))
WHERE deleted_at IS NULL;