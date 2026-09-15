-- enable_purchase_code_month_year_adeeba_studio
UPDATE public.settings s
SET purchase_settings = COALESCE(s.purchase_settings, '{}'::jsonb) || jsonb_build_object('purchase_code_include_date', true)
FROM public.organizations o
WHERE o.id = s.organization_id
  AND o.slug = 'adeeba-areeba-studio';