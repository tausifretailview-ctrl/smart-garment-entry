-- Persist send_provider reliably (client types may lag; ensures edge reads wappconnect).

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

  IF p_send_provider IS NOT NULL AND p_send_provider NOT IN ('existing', 'wappconnect') THEN
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
  'Set whatsapp_api_settings.send_provider (existing | wappconnect) for an org.';

GRANT EXECUTE ON FUNCTION public.set_whatsapp_send_provider(uuid, text) TO authenticated;
