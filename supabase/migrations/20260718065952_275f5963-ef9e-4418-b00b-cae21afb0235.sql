UPDATE public.settings
SET sale_settings = jsonb_set(
      COALESCE(sale_settings, '{}'::jsonb),
      '{invoice_series_start}',
      '"INV/26-27/20"'::jsonb,
      true
    ),
    updated_at = now()
WHERE organization_id = '056b0f96-c62c-4439-ac26-6bba54575012';