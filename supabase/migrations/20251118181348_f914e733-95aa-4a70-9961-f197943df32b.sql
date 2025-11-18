-- Add invoice-specific fields to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS payment_term TEXT,
ADD COLUMN IF NOT EXISTS terms_conditions TEXT,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS shipping_instructions TEXT,
ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'standard';

-- Add comment for clarity
COMMENT ON COLUMN public.sales.sale_type IS 'Type of sale: pos, invoice, or other types';
COMMENT ON COLUMN public.sales.invoice_type IS 'Invoice type: standard, proforma, credit_note, etc.';