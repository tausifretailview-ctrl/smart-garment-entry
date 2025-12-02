-- Add opening_balance column to customers table
ALTER TABLE public.customers 
ADD COLUMN opening_balance numeric DEFAULT 0;

-- Add opening_balance column to suppliers table
ALTER TABLE public.suppliers 
ADD COLUMN opening_balance numeric DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.customers.opening_balance IS 'Opening balance for accounting carry-forward (positive = receivable from customer)';
COMMENT ON COLUMN public.suppliers.opening_balance IS 'Opening balance for accounting carry-forward (positive = payable to supplier)';