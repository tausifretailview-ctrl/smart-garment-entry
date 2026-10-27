-- When the Ezzy ERP WhatsApp link last changed state (gateway "connected" / "disconnected" events),
-- shown on the Platform Admin "not linked" card. The app works without it (falls back to updated_at).
ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS builtin_status_at timestamptz;
