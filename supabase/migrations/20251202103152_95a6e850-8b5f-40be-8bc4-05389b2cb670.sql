-- Add refund_amount column to sales table
ALTER TABLE public.sales 
ADD COLUMN refund_amount numeric DEFAULT 0;