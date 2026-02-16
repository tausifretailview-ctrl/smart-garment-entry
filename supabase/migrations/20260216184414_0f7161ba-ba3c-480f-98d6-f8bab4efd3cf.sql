
-- Add fee receipt and fee reminder WhatsApp template settings
ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS auto_send_fee_receipt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_receipt_template_name text,
  ADD COLUMN IF NOT EXISTS fee_receipt_template_params jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_send_fee_reminder boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_reminder_template_name text,
  ADD COLUMN IF NOT EXISTS fee_reminder_template_params jsonb DEFAULT '[]'::jsonb;
