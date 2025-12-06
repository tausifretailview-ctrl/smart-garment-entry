-- Add salesman column to quotations table
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS salesman text;

-- Add salesman column to sale_orders table
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS salesman text;