-- Add color column to product_variants table
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS color TEXT;

-- Drop existing unique constraint if it exists (product_id, size)
ALTER TABLE public.product_variants 
DROP CONSTRAINT IF EXISTS product_variants_product_id_size_key;

-- Create new unique constraint including color
ALTER TABLE public.product_variants 
ADD CONSTRAINT product_variants_product_id_color_size_key 
UNIQUE (product_id, color, size);

-- Create index for color lookups
CREATE INDEX IF NOT EXISTS idx_product_variants_color 
ON public.product_variants(color);