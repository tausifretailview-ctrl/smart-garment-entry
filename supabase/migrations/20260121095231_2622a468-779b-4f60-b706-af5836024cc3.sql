-- Add unit of measurement column to products table
ALTER TABLE public.products 
ADD COLUMN uom TEXT NOT NULL DEFAULT 'NOS';

-- Add comment for documentation
COMMENT ON COLUMN public.products.uom IS 'Unit of Measurement: NOS, KG, LTR, MTR, DZN, HLF_DZN, BOX, PCS, SET, GMS';