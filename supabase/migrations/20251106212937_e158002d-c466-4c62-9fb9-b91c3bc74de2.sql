-- Add sku_id column to purchase_items table to link to product_variants
ALTER TABLE public.purchase_items 
ADD COLUMN IF NOT EXISTS sku_id uuid REFERENCES public.product_variants(id);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_purchase_items_sku_id ON public.purchase_items(sku_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_size ON public.purchase_items(product_id, size);