-- New organizations only: seed full WhatsApp credentials + invoice_1 (6 params).
-- Existing whatsapp_api_settings rows are never updated by this migration.

-- Platform template for seed_organization_whatsapp_settings (token only if not already set).
UPDATE public.platform_settings
SET setting_value = COALESCE(setting_value, '{}'::jsonb) || jsonb_build_object(
  'api_provider', 'third_party',
  'custom_api_url', COALESCE(NULLIF(TRIM(setting_value->>'custom_api_url'), ''), 'https://crmapi.wappconnect.com/api/meta'),
  'api_version', COALESCE(NULLIF(TRIM(setting_value->>'api_version'), ''), 'v21.0'),
  'business_id', COALESCE(NULLIF(TRIM(setting_value->>'business_id'), ''), '247325313237950'),
  'phone_number_id', COALESCE(NULLIF(TRIM(setting_value->>'phone_number_id'), ''), '997588563431761'),
  'waba_id', COALESCE(NULLIF(TRIM(setting_value->>'waba_id'), ''), '2393068857780985'),
  'access_token', COALESCE(
    NULLIF(TRIM(setting_value->>'access_token'), ''),
    'DD4EXjn0QrvoLDQLsN5jKNqwB5CfyVU5ERVJTQO9SRQiNmG5hWWnb3REFTSAREFTSADf1Aie2LCleiHxlBahUhRWrhi0oicRWONqdiQHfDbHb9mx8SNJfAsPyxwaiddNr3NOIOFvEUAD4Dw36A'
  ),
  'webhook_verify_token', COALESCE(NULLIF(TRIM(setting_value->>'webhook_verify_token'), ''), 'lovable_whatsapp_webhook'),
  'invoice_template_name', COALESCE(NULLIF(TRIM(setting_value->>'invoice_template_name'), ''), 'invoice_1'),
  'invoice_template_params', COALESCE(
    setting_value->'invoice_template_params',
    '[
      {"index":1,"field":"customer_name","label":"Customer Name"},
      {"index":2,"field":"invoice_number","label":"Invoice Number"},
      {"index":3,"field":"invoice_date","label":"Invoice Date"},
      {"index":4,"field":"amount","label":"Amount"},
      {"index":5,"field":"invoice_link","label":"Invoice Link"},
      {"index":6,"field":"organization_name","label":"Organization Name"}
    ]'::jsonb
  ),
  'auto_send_invoice', COALESCE((setting_value->>'auto_send_invoice')::boolean, true)
),
updated_at = now()
WHERE setting_key = 'default_whatsapp_api';

CREATE OR REPLACE FUNCTION public.seed_organization_whatsapp_settings(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults jsonb;
  v_org_name text;
  v_invoice_params jsonb;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.whatsapp_api_settings WHERE organization_id = p_organization_id
  ) THEN
    RETURN;
  END IF;

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
END;
$$;
