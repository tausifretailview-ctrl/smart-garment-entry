-- Third send option: "builtin" (own WhatsApp via self-hosted wa-gateway, QR-linked).
-- Default stays 'existing' so current organizations are unchanged.

ALTER TABLE public.whatsapp_api_settings
  DROP CONSTRAINT IF EXISTS whatsapp_api_settings_send_provider_check;

-- NOT VALID + VALIDATE keeps the exclusive lock short (validation scans without blocking writes).
ALTER TABLE public.whatsapp_api_settings
  ADD CONSTRAINT whatsapp_api_settings_send_provider_check
  CHECK (send_provider IN ('existing', 'wappconnect', 'builtin')) NOT VALID;
ALTER TABLE public.whatsapp_api_settings
  VALIDATE CONSTRAINT whatsapp_api_settings_send_provider_check;

COMMENT ON COLUMN public.whatsapp_api_settings.send_provider IS
  'Outbound routing: existing (Meta/BSP), wappconnect (WappConnect instance), builtin (own WhatsApp via wa-gateway).';

CREATE OR REPLACE FUNCTION public.set_whatsapp_send_provider(
  p_organization_id uuid,
  p_send_provider text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF p_send_provider IS NOT NULL AND p_send_provider NOT IN ('existing', 'wappconnect', 'builtin') THEN
    RAISE EXCEPTION 'invalid send_provider: %', p_send_provider;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_org_role(auth.uid(), p_organization_id, 'admin'::public.app_role)
    OR public.has_org_role(auth.uid(), p_organization_id, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to update WhatsApp send provider for this organization';
  END IF;

  UPDATE public.whatsapp_api_settings
  SET send_provider = COALESCE(NULLIF(trim(p_send_provider), ''), 'existing'),
      updated_at = now()
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    INSERT INTO public.whatsapp_api_settings (
      organization_id,
      send_provider,
      is_active,
      api_provider
    )
    VALUES (
      p_organization_id,
      COALESCE(NULLIF(trim(p_send_provider), ''), 'existing'),
      false,
      'third_party'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_whatsapp_send_provider(uuid, text) IS
  'Set whatsapp_api_settings.send_provider (existing | wappconnect | builtin) for an org.';

GRANT EXECUTE ON FUNCTION public.set_whatsapp_send_provider(uuid, text) TO authenticated;

ALTER TABLE public.whatsapp_logs
  DROP CONSTRAINT IF EXISTS whatsapp_logs_provider_check;

ALTER TABLE public.whatsapp_logs
  ADD CONSTRAINT whatsapp_logs_provider_check
  CHECK (provider IS NULL OR provider IN ('existing', 'wappconnect', 'builtin')) NOT VALID;
ALTER TABLE public.whatsapp_logs
  VALIDATE CONSTRAINT whatsapp_logs_provider_check;

-- Display-only status for the built-in (QR-linked) session, kept fresh by wa-gateway-proxy.
ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS builtin_connected_number text,
  ADD COLUMN IF NOT EXISTS builtin_status text;
