-- Add 'hold' to the payment_status check constraint
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_status_check;

ALTER TABLE public.sales ADD CONSTRAINT sales_payment_status_check 
CHECK (payment_status IN ('pending', 'partial', 'completed', 'hold'));