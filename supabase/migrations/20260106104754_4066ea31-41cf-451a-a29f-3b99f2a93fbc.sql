-- Drop the old constraint and add a new one with more payment methods
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;

ALTER TABLE public.sales ADD CONSTRAINT sales_payment_method_check 
CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'upi'::text, 'multiple'::text, 'pay_later'::text, 'bank_transfer'::text, 'cheque'::text, 'other'::text]));