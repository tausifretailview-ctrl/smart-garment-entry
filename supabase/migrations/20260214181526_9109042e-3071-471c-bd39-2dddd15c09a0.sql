
-- Add third-party WhatsApp API provider columns to whatsapp_api_settings
ALTER TABLE public.whatsapp_api_settings 
  ADD COLUMN IF NOT EXISTS api_provider text NOT NULL DEFAULT 'meta_direct',
  ADD COLUMN IF NOT EXISTS custom_api_url text,
  ADD COLUMN IF NOT EXISTS api_version text NOT NULL DEFAULT 'v21.0',
  ADD COLUMN IF NOT EXISTS business_id text;
