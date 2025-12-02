-- Add paid_amount column to sales table for tracking payments
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;

-- Update existing records to set paid_amount equal to net_amount for completed payments
UPDATE public.sales 
SET paid_amount = net_amount 
WHERE payment_status = 'completed' AND paid_amount IS NULL;

-- Update existing records to set paid_amount to 0 for pending payments
UPDATE public.sales 
SET paid_amount = 0 
WHERE payment_status = 'pending' AND paid_amount IS NULL;