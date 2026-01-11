-- Add template parameter mapping columns to whatsapp_api_settings
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS invoice_template_params JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS quotation_template_params JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS sale_order_template_params JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS payment_reminder_template_params JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN whatsapp_api_settings.invoice_template_params IS 'JSON array mapping template parameters to data fields for invoice template';
COMMENT ON COLUMN whatsapp_api_settings.quotation_template_params IS 'JSON array mapping template parameters to data fields for quotation template';
COMMENT ON COLUMN whatsapp_api_settings.sale_order_template_params IS 'JSON array mapping template parameters to data fields for sale order template';
COMMENT ON COLUMN whatsapp_api_settings.payment_reminder_template_params IS 'JSON array mapping template parameters to data fields for payment reminder template';