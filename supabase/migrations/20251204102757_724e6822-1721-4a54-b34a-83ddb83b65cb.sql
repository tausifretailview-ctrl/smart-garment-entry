-- Add MRP column to product_variants table
ALTER TABLE public.product_variants
ADD COLUMN mrp NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.product_variants.mrp IS 'Maximum Retail Price for discount calculation';