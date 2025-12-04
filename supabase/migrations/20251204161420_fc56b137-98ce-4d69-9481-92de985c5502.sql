-- Add E-Invoice fields to sales table
ALTER TABLE public.sales
ADD COLUMN IF NOT EXISTS irn VARCHAR(64),
ADD COLUMN IF NOT EXISTS ack_no VARCHAR(20),
ADD COLUMN IF NOT EXISTS ack_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS signed_qr_code TEXT,
ADD COLUMN IF NOT EXISTS einvoice_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS einvoice_error TEXT;

-- Create index for IRN lookups
CREATE INDEX IF NOT EXISTS idx_sales_irn ON public.sales(irn) WHERE irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_einvoice_status ON public.sales(einvoice_status);

-- Add E-Invoice settings column to settings table (if not exists in sale_settings JSON)
COMMENT ON COLUMN public.sales.irn IS 'Invoice Reference Number from NIC E-Invoice portal';
COMMENT ON COLUMN public.sales.ack_no IS 'Acknowledgement Number from NIC';
COMMENT ON COLUMN public.sales.ack_date IS 'Acknowledgement Date from NIC';
COMMENT ON COLUMN public.sales.signed_qr_code IS 'Signed QR Code data for invoice';
COMMENT ON COLUMN public.sales.einvoice_status IS 'E-Invoice status: pending, generated, cancelled, failed';
COMMENT ON COLUMN public.sales.einvoice_error IS 'Error message if e-invoice generation failed';