-- Opt-in WappConnect WhatsApp PDF template override.
-- NULL = use the same template as POS/print (existing live behavior).

ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS wappconnect_pdf_invoice_template text;

COMMENT ON COLUMN public.whatsapp_api_settings.wappconnect_pdf_invoice_template IS
  'Optional invoice template id for WappConnect PDF capture only. NULL keeps POS/print template.';
