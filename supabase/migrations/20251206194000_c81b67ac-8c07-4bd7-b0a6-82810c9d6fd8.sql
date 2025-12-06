-- Add salesman column to sales table
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS salesman text;