-- Add sale_return_adjust column to sales table
ALTER TABLE public.sales 
ADD COLUMN sale_return_adjust numeric DEFAULT 0;