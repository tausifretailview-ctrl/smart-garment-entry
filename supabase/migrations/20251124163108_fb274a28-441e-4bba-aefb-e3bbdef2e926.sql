-- Add payment tracking fields to purchase_bills table
ALTER TABLE public.purchase_bills
ADD COLUMN payment_status text DEFAULT 'unpaid',
ADD COLUMN paid_amount numeric DEFAULT 0;

-- Add check constraint for valid payment statuses
ALTER TABLE public.purchase_bills
ADD CONSTRAINT valid_payment_status 
CHECK (payment_status IN ('paid', 'unpaid', 'partial'));

-- Add check constraint to ensure paid_amount is not negative
ALTER TABLE public.purchase_bills
ADD CONSTRAINT non_negative_paid_amount 
CHECK (paid_amount >= 0);

COMMENT ON COLUMN public.purchase_bills.payment_status IS 'Payment status: paid, unpaid, or partial';
COMMENT ON COLUMN public.purchase_bills.paid_amount IS 'Amount paid towards this purchase bill';