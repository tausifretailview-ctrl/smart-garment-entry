-- Add color column to sale_items table
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS color TEXT;

-- Add color column to quotation_items table
ALTER TABLE public.quotation_items ADD COLUMN IF NOT EXISTS color TEXT;

-- Add color column to sale_order_items table
ALTER TABLE public.sale_order_items ADD COLUMN IF NOT EXISTS color TEXT;

-- Add color column to sale_return_items table
ALTER TABLE public.sale_return_items ADD COLUMN IF NOT EXISTS color TEXT;

-- Add color column to purchase_return_items table
ALTER TABLE public.purchase_return_items ADD COLUMN IF NOT EXISTS color TEXT;