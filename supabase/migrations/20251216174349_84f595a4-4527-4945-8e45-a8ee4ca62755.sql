-- Add invoice_format column to sale_orders table
ALTER TABLE public.sale_orders 
ADD COLUMN IF NOT EXISTS invoice_format TEXT DEFAULT 'standard';

-- Add comment for clarity
COMMENT ON COLUMN public.sale_orders.invoice_format IS 'Invoice format: standard or wholesale-size-grouping';