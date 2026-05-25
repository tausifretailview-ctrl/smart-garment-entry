-- Third-party WhatsApp only: platform defaults + seed row on every new organization.

-- Extend platform default with third-party fields (token remains in platform_settings — set via Platform Admin)
UPDATE public.platform_settings
SET setting_value = COALESCE(setting_value, '{}'::jsonb) || jsonb_build_object(
  'api_provider', 'third_party',
  'custom_api_url', 'https://crmapi.wappconnect.com/api/meta',
  'api_version', 'v21.0',
  'business_id', '247325313237950',
  'phone_number_id', COALESCE(setting_value->>'phone_number_id', '997588563431761'),
  'waba_id', COALESCE(setting_value->>'waba_id', '2393068857780985'),
  'business_name', COALESCE(setting_value->>'business_name', 'Platform WhatsApp')
),
updated_at = now()
WHERE setting_key = 'default_whatsapp_api';

-- Existing orgs: treat legacy meta_direct as third-party (UI no longer offers Direct Meta)
UPDATE public.whatsapp_api_settings
SET api_provider = 'third_party',
    use_default_api = false
WHERE api_provider IS NULL OR api_provider = 'meta_direct';

CREATE OR REPLACE FUNCTION public.seed_organization_whatsapp_settings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_api_settings WHERE organization_id = p_organization_id
  ) THEN
    RETURN;
  END IF;

  SELECT setting_value INTO v_defaults
  FROM public.platform_settings
  WHERE setting_key = 'default_whatsapp_api';

  v_defaults := COALESCE(v_defaults, '{}'::jsonb);

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
    business_id
  ) VALUES (
    p_organization_id,
    'meta_cloud_api',
    NULLIF(TRIM(v_defaults->>'phone_number_id'), ''),
    NULLIF(TRIM(v_defaults->>'waba_id'), ''),
    NULLIF(TRIM(v_defaults->>'access_token'), ''),
    NULLIF(TRIM(v_defaults->>'business_name'), ''),
    true,
    false,
    COALESCE(NULLIF(TRIM(v_defaults->>'api_provider'), ''), 'third_party'),
    COALESCE(NULLIF(TRIM(v_defaults->>'custom_api_url'), ''), 'https://crmapi.wappconnect.com/api/meta'),
    COALESCE(NULLIF(TRIM(v_defaults->>'api_version'), ''), 'v21.0'),
    NULLIF(TRIM(COALESCE(v_defaults->>'business_id', v_defaults->>'waba_id')), '')
  );
END;
$$;

-- Self-service org signup
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_user_id uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org record;
  v_next_org_number INTEGER;
  v_slug TEXT;
  v_base_slug TEXT;
  v_counter INTEGER := 0;
  v_starting_barcode BIGINT;
BEGIN
  SELECT COALESCE(MAX(organization_number), 0) + 1
  INTO v_next_org_number
  FROM public.organizations;

  v_base_slug := lower(regexp_replace(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_slug := v_base_slug;

  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  INSERT INTO public.organizations (name, slug, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, v_slug, 'free', '[]'::jsonb, '{}'::jsonb, v_next_org_number)
  RETURNING * INTO v_org;

  v_starting_barcode := (v_next_org_number::bigint * 10000000) + 1001;
  INSERT INTO barcode_sequence (organization_id, next_barcode)
  VALUES (v_org.id, v_starting_barcode)
  ON CONFLICT (organization_id) DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, p_user_id, 'admin');

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  PERFORM public.seed_organization_whatsapp_settings(v_org.id);

  RETURN row_to_json(v_org);
END;
$function$;

-- Platform admin org creation
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_name text,
  p_enabled_features text[] DEFAULT ARRAY[]::text[],
  p_admin_email text DEFAULT NULL::text,
  p_organization_type text DEFAULT 'business'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_slug text;
  v_next_org_number integer;
BEGIN
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-|-$', '', 'g');

  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substring(gen_random_uuid()::text from 1 for 6);
  END IF;

  SELECT COALESCE(MAX(organization_number), 0) + 1 INTO v_next_org_number FROM organizations;

  INSERT INTO public.organizations (
    name, slug, subscription_tier, enabled_features, settings, organization_number, organization_type
  )
  VALUES (
    p_name, v_slug, 'professional', array_to_json(p_enabled_features)::jsonb, '{}'::jsonb, v_next_org_number, p_organization_type
  )
  RETURNING id INTO v_org_id;

  IF p_admin_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_admin_email;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'admin')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';

      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;

  PERFORM public.seed_organization_whatsapp_settings(v_org_id);

  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_slug,
    'organization_number', v_next_org_number,
    'organization_type', p_organization_type
  );
END;
$function$;
