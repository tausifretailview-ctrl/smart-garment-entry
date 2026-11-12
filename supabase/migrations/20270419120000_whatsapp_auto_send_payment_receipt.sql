-- Settings → WhatsApp "Auto-send Payment Receipt" (Nov 2026).
-- After a payment is collected on the POS / Sales dashboard the receipt is sent to the
-- customer on WhatsApp by itself (Ezzy WhatsApp built-in or WappConnect only; the Meta
-- Business API needs an approved template, so those shops keep the manual button).
-- On by default, as the shop owner asked; a shop can turn it off in Settings → WhatsApp.
-- SAFETY: one additive column. UNDO: ALTER TABLE public.whatsapp_api_settings DROP COLUMN auto_send_payment_receipt;

ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS auto_send_payment_receipt boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.whatsapp_api_settings.auto_send_payment_receipt IS
  'Send the payment receipt on WhatsApp after a payment is collected on the POS / Sales dashboard (built-in / WappConnect).';
