-- Restore public.seed_organization_whatsapp_settings(uuid).
--
-- Root cause: live create_organization already PERFORMs this function (Postgres 42883
-- "does not exist" on Add another organization). The body was defined in
-- 20260605130000 and 20260625120000 but never landed in the live database
-- (PostgREST PGRST202 / not in schema cache).
--
-- This file is the apply vehicle. It does NOT rewrite create_organization or
-- platform_create_organization (those paths stay as they are). Do NOT paste
-- 20260625120000 in full — that file also UPDATEs every whatsapp_api_settings row
-- and replaces platform_create_organization.
--
-- Also inserts a public.settings row when missing. POS / sale / purchase defaults
-- live in that row (jsonb, default '{}'); older platform_create_organization used
-- to insert it, latest create_organization does not.

CREATE OR REPLACE FUNCTION public.seed_organization_whatsapp_settings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_defaults jsonb;
  v_org_name text;
  v_invoice_params jsonb;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id is required';
  END IF;

  -- Nested PERFORM from create_organization / platform_create_organization keeps
  -- the JWT role. Anon is rejected; authenticated needs membership or platform_admin
  -- (platform admin may not be a member of the org they just created).
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT (
       p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
       OR public.has_role(auth.uid(), 'platform_admin'::public.app_role)
     ) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_api_settings WHERE organization_id = p_organization_id
  ) THEN
    SELECT name INTO v_org_name
    FROM public.organizations
    WHERE id = p_organization_id;

    SELECT setting_value INTO v_defaults
    FROM public.platform_settings
    WHERE setting_key = 'default_whatsapp_api';

    v_defaults := COALESCE(v_defaults, '{}'::jsonb);

    v_invoice_params := COALESCE(
      v_defaults->'invoice_template_params',
      '[
        {"index":1,"field":"customer_name","label":"Customer Name"},
        {"index":2,"field":"invoice_number","label":"Invoice Number"},
        {"index":3,"field":"invoice_date","label":"Invoice Date"},
        {"index":4,"field":"amount","label":"Amount"},
        {"index":5,"field":"invoice_link","label":"Invoice Link"},
        {"index":6,"field":"organization_name","label":"Organization Name"}
      ]'::jsonb
    );

    INSERT INTO public.whatsapp_api_settings (
      organization_id,
      provider,
      phone_number_id,
      waba_id,
      access_token,
      business_name,
      is_active,
      use_default_api,
      api_provider,
      custom_api_url,
      api_version,
      business_id,
      webhook_verify_token,
      invoice_template_name,
      invoice_template_params,
      auto_send_invoice
    ) VALUES (
      p_organization_id,
      'meta_cloud_api',
      NULLIF(TRIM(v_defaults->>'phone_number_id'), ''),
      NULLIF(TRIM(v_defaults->>'waba_id'), ''),
      NULLIF(TRIM(v_defaults->>'access_token'), ''),
      COALESCE(NULLIF(TRIM(v_org_name), ''), NULLIF(TRIM(v_defaults->>'business_name'), '')),
      true,
      false,
      COALESCE(NULLIF(TRIM(v_defaults->>'api_provider'), ''), 'third_party'),
      COALESCE(NULLIF(TRIM(v_defaults->>'custom_api_url'), ''), 'https://crmapi.wappconnect.com/api/meta'),
      COALESCE(NULLIF(TRIM(v_defaults->>'api_version'), ''), 'v21.0'),
      NULLIF(TRIM(COALESCE(v_defaults->>'business_id', v_defaults->>'waba_id')), ''),
      COALESCE(NULLIF(TRIM(v_defaults->>'webhook_verify_token'), ''), 'lovable_whatsapp_webhook'),
      COALESCE(NULLIF(TRIM(v_defaults->>'invoice_template_name'), ''), 'invoice_1'),
      v_invoice_params,
      COALESCE((v_defaults->>'auto_send_invoice')::boolean, true)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.settings WHERE organization_id = p_organization_id
  ) THEN
    INSERT INTO public.settings (organization_id)
    VALUES (p_organization_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.seed_organization_whatsapp_settings(uuid) IS
  'Seeds default whatsapp_api_settings and a settings row for a newly created org. Called from create_organization / platform_create_organization.';

REVOKE ALL ON FUNCTION public.seed_organization_whatsapp_settings(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_organization_whatsapp_settings(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_organization_whatsapp_settings(uuid) TO authenticated, service_role;
