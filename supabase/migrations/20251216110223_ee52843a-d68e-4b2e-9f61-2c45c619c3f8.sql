-- Allow null variant_id for custom sizes in sale_order_items
ALTER TABLE public.sale_order_items 
ALTER COLUMN variant_id DROP NOT NULL;