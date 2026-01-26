-- First, drop the existing unique index if it exists (from previous migration)
DROP INDEX IF EXISTS product_variants_product_color_size_unique;

-- Create a partial unique index that:
-- 1. Only applies to non-deleted records (WHERE deleted_at IS NULL)
-- 2. Treats NULL colors as equal using COALESCE
-- 3. Can be used by ON CONFLICT via the index expression
CREATE UNIQUE INDEX product_variants_active_product_color_size_idx 
ON product_variants (product_id, COALESCE(color, ''), size) 
WHERE deleted_at IS NULL;