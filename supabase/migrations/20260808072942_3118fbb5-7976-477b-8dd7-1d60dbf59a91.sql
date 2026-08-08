UPDATE public.barcode_label_settings
SET setting_data = jsonb_set(jsonb_set(setting_data, '{labelWidth}', '39'::jsonb), '{labelHeight}', '35'::jsonb),
    updated_at = now()
WHERE organization_id = 'e50803d3-e962-4f19-95dd-47c6e30e796a'
  AND setting_type = 'label_template'
  AND setting_name = '40 label';