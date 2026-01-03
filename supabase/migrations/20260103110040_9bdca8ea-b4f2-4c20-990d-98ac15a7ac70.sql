-- Add e-Invoice columns to sales table for WhiteBooks integration
ALTER TABLE public.sales 
ADD COLUMN IF NOT EXISTS irn TEXT,
ADD COLUMN IF NOT EXISTS ack_no TEXT,
ADD COLUMN IF NOT EXISTS ack_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signed_invoice TEXT,
ADD COLUMN IF NOT EXISTS einvoice_qr_code TEXT,
ADD COLUMN IF NOT EXISTS einvoice_error TEXT,
ADD COLUMN IF NOT EXISTS einvoice_status TEXT DEFAULT 'pending';

-- Add index for IRN lookups
CREATE INDEX IF NOT EXISTS idx_sales_irn ON public.sales(irn) WHERE irn IS NOT NULL;

-- Add index for e-invoice status filtering
CREATE INDEX IF NOT EXISTS idx_sales_einvoice_status ON public.sales(einvoice_status) WHERE einvoice_status IS NOT NULL;