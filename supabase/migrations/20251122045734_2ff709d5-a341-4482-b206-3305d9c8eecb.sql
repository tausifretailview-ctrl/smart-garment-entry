-- Add supplier_code column to suppliers table
ALTER TABLE public.suppliers 
ADD COLUMN supplier_code TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.suppliers.supplier_code IS 'Unique supplier code used for identification on barcode labels';