-- Add credit_applied column to sales table for tracking credit note usage
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS credit_applied NUMERIC DEFAULT 0;