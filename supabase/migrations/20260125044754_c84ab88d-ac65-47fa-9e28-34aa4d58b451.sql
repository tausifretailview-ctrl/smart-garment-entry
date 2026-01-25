-- Create storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('invoice-pdfs', 'invoice-pdfs', true, 5242880, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- RLS policies for invoice-pdfs bucket
CREATE POLICY "Organization members can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-pdfs');

CREATE POLICY "Anyone can view invoice PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Organization members can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-pdfs');

-- Add send_invoice_pdf column to whatsapp_api_settings
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS send_invoice_pdf boolean DEFAULT false;

-- Add invoice_pdf_template column to select which template to use
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS invoice_pdf_template text DEFAULT 'professional';