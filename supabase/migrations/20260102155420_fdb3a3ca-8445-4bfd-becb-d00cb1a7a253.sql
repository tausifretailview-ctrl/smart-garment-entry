-- Add points_redeemed_amount column to sales table
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS points_redeemed_amount numeric DEFAULT 0;