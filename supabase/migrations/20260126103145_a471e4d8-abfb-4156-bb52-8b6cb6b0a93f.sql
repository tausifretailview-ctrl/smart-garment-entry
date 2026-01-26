-- Add customer_accepted column to sale_orders table
ALTER TABLE public.sale_orders 
ADD COLUMN IF NOT EXISTS customer_accepted boolean DEFAULT false;