-- Enable purchase-code month/year wrap (MMCODEYR) for all organizations.
-- Orgs that explicitly set purchase_code_include_date = false are left unchanged.
UPDATE public.settings s
SET purchase_settings = COALESCE(s.purchase_settings, '{}'::jsonb)
  || jsonb_build_object('purchase_code_include_date', true)
WHERE (s.purchase_settings->>'purchase_code_include_date') IS DISTINCT FROM 'false';
