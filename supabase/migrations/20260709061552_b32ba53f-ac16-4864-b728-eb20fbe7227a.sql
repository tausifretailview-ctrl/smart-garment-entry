UPDATE public.settings
SET sale_settings = jsonb_set(
  jsonb_set(COALESCE(sale_settings, '{}'::jsonb), '{pos_numbering_format}', '"POS/26-27/{####}"'::jsonb, true),
  '{pos_series_start}', '""'::jsonb, true
)
WHERE organization_id = 'ee0ea1e5-21ea-4803-ab2b-c59704ceaecc';