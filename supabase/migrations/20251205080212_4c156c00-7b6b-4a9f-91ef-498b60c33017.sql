-- Add hsn_code column to sale_items
ALTER TABLE public.sale_items 
ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Add hsn_code column to sale_return_items
ALTER TABLE public.sale_return_items 
ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Add hsn_code column to quotation_items
ALTER TABLE public.quotation_items 
ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Add hsn_code column to sale_order_items
ALTER TABLE public.sale_order_items 
ADD COLUMN IF NOT EXISTS hsn_code TEXT;