-- Add discount_percent column to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS discount_percent numeric DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.customers.discount_percent IS 'Fixed discount percentage for this customer, auto-applied on invoices';