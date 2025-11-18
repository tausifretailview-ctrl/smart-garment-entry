-- Add payment_date field to sales table for tracking when payment was received
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS payment_date DATE;

COMMENT ON COLUMN public.sales.payment_date IS 'Date when payment was received';