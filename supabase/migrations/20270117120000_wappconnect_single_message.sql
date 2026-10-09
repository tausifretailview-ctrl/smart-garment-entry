-- WappConnect / Our WhatsApp: send the bill text as the invoice PDF's caption, so each
-- customer gets one WhatsApp message instead of two (text, then PDF).
-- Off by default: every shop keeps today's text + PDF until it turns this on in
-- Settings → WhatsApp → Invoice PDF Attachment. send-whatsapp falls back to text + PDF
-- when the caption is too long for WhatsApp or WappConnect refuses the captioned send.

ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS wappconnect_single_message boolean NOT NULL DEFAULT false;
