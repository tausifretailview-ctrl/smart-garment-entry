-- Add columns for document header template support
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS invoice_document_template_name TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS invoice_document_template_params JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS use_document_header_template BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN whatsapp_api_settings.invoice_document_template_name IS 'Template name for PDF with document header (bypasses 24h window)';
COMMENT ON COLUMN whatsapp_api_settings.use_document_header_template IS 'If true, upload PDF to Meta and send as template header instead of separate message';