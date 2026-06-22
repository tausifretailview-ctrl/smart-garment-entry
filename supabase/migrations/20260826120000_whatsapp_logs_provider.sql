-- Phase 3: Record which outbound send path handled each WhatsApp log row.

ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS provider text;

ALTER TABLE public.whatsapp_logs
  DROP CONSTRAINT IF EXISTS whatsapp_logs_provider_check;

ALTER TABLE public.whatsapp_logs
  ADD CONSTRAINT whatsapp_logs_provider_check
  CHECK (provider IS NULL OR provider IN ('existing', 'wappconnect'));

COMMENT ON COLUMN public.whatsapp_logs.provider IS
  'Outbound send path: existing (Meta/BSP) or wappconnect. NULL on legacy rows before this column.';

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_org_provider_created
  ON public.whatsapp_logs (organization_id, provider, created_at DESC);
