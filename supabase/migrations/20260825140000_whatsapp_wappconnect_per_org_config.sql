-- Phase 1: Per-org WhatsApp send provider (existing Meta/BSP vs WappConnect instance API).
-- Instance id is stored in whatsapp_wappconnect_secrets (service_role only — no client SELECT).

-- Client-readable provider switch + display label on existing settings row.
ALTER TABLE public.whatsapp_api_settings
  ADD COLUMN IF NOT EXISTS send_provider text NOT NULL DEFAULT 'existing',
  ADD COLUMN IF NOT EXISTS wappconnect_connected_number text;

ALTER TABLE public.whatsapp_api_settings
  DROP CONSTRAINT IF EXISTS whatsapp_api_settings_send_provider_check;

ALTER TABLE public.whatsapp_api_settings
  ADD CONSTRAINT whatsapp_api_settings_send_provider_check
  CHECK (send_provider IN ('existing', 'wappconnect'));

COMMENT ON COLUMN public.whatsapp_api_settings.send_provider IS
  'Outbound send routing: existing = Meta/BSP via send-whatsapp (default); wappconnect = WappConnect instance API.';

COMMENT ON COLUMN public.whatsapp_api_settings.wappconnect_connected_number IS
  'Display-only label for the shop WhatsApp number connected via WappConnect (not used for send auth).';

-- Explicit backfill: all current orgs stay on existing provider until opted in.
UPDATE public.whatsapp_api_settings
SET send_provider = 'existing'
WHERE send_provider IS DISTINCT FROM 'existing'
  AND send_provider IS DISTINCT FROM 'wappconnect';

-- Instance id secret — one row per org; never exposed to browser/PostgREST clients.
CREATE TABLE IF NOT EXISTS public.whatsapp_wappconnect_secrets (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_wappconnect_secrets_instance_id_nonempty
    CHECK (length(trim(instance_id)) > 0)
);

COMMENT ON TABLE public.whatsapp_wappconnect_secrets IS
  'WappConnect instance id per org (send auth token). Readable only via service_role or SECURITY DEFINER RPCs — never SELECT from client.';

ALTER TABLE public.whatsapp_wappconnect_secrets ENABLE ROW LEVEL SECURITY;

-- No RLS policies for authenticated/anon → no direct table access from the app client.

REVOKE ALL ON TABLE public.whatsapp_wappconnect_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.whatsapp_wappconnect_secrets FROM anon;
REVOKE ALL ON TABLE public.whatsapp_wappconnect_secrets FROM authenticated;

GRANT ALL ON TABLE public.whatsapp_wappconnect_secrets TO service_role;

DROP TRIGGER IF EXISTS update_whatsapp_wappconnect_secrets_updated_at
  ON public.whatsapp_wappconnect_secrets;

CREATE TRIGGER update_whatsapp_wappconnect_secrets_updated_at
  BEFORE UPDATE ON public.whatsapp_wappconnect_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Admin/manager: save instance id without returning it to the client.
CREATE OR REPLACE FUNCTION public.upsert_wappconnect_instance_secret(
  p_organization_id uuid,
  p_instance_id text
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

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    public.has_org_role(auth.uid(), p_organization_id, 'admin'::public.app_role)
    OR public.has_org_role(auth.uid(), p_organization_id, 'manager'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Not authorized to update WappConnect settings for this organization';
  END IF;

  IF p_instance_id IS NULL OR trim(p_instance_id) = '' THEN
    DELETE FROM public.whatsapp_wappconnect_secrets
    WHERE organization_id = p_organization_id;
    RETURN;
  END IF;

  INSERT INTO public.whatsapp_wappconnect_secrets (organization_id, instance_id, updated_at)
  VALUES (p_organization_id, trim(p_instance_id), now())
  ON CONFLICT (organization_id) DO UPDATE
  SET instance_id = EXCLUDED.instance_id,
      updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.upsert_wappconnect_instance_secret(uuid, text) IS
  'Store or clear WappConnect instance id for an org (admin/manager). Full value never returned to client.';

-- Admin/manager: masked instance id for Settings UI (last 4 chars only).
CREATE OR REPLACE FUNCTION public.get_wappconnect_instance_masked(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_len integer;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.has_org_role(auth.uid(), p_organization_id, 'admin'::public.app_role)
    OR public.has_org_role(auth.uid(), p_organization_id, 'manager'::public.app_role)
  ) THEN
    RETURN NULL;
  END IF;

  SELECT s.instance_id INTO v_id
  FROM public.whatsapp_wappconnect_secrets AS s
  WHERE s.organization_id = p_organization_id;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_len := length(v_id);
  IF v_len <= 4 THEN
    RETURN repeat('*', v_len);
  END IF;

  RETURN repeat('*', v_len - 4) || right(v_id, 4);
END;
$$;

COMMENT ON FUNCTION public.get_wappconnect_instance_masked(uuid) IS
  'Returns masked WappConnect instance id (last 4 visible) for admin/manager Settings UI.';

GRANT EXECUTE ON FUNCTION public.upsert_wappconnect_instance_secret(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_wappconnect_instance_masked(uuid) TO authenticated;
