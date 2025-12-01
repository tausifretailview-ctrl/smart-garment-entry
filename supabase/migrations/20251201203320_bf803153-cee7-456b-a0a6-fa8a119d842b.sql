-- Add round_off column to purchase_bills table
ALTER TABLE public.purchase_bills 
ADD COLUMN round_off numeric DEFAULT 0;