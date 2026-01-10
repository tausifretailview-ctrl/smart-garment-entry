-- Add template name columns to whatsapp_api_settings for Meta-approved templates
ALTER TABLE public.whatsapp_api_settings 
ADD COLUMN IF NOT EXISTS invoice_template_name text,
ADD COLUMN IF NOT EXISTS quotation_template_name text,
ADD COLUMN IF NOT EXISTS sale_order_template_name text,
ADD COLUMN IF NOT EXISTS payment_reminder_template_name text;