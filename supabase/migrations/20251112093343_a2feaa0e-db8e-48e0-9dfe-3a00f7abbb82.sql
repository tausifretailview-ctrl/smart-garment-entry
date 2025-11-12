-- Add opening_qty column to product_variants table
ALTER TABLE product_variants 
ADD COLUMN IF NOT EXISTS opening_qty integer DEFAULT 0;

COMMENT ON COLUMN product_variants.opening_qty IS 'Initial stock quantity added without purchase bill';