-- Add invoice link and social media settings to whatsapp_api_settings
ALTER TABLE whatsapp_api_settings
ADD COLUMN IF NOT EXISTS auto_send_invoice_link BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS invoice_link_message TEXT DEFAULT '📄 View your invoice online: {invoice_link}

Thank you for your business!',
ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;