-- Add product_name column to purchase_items table
ALTER TABLE public.purchase_items
ADD COLUMN IF NOT EXISTS product_name TEXT;