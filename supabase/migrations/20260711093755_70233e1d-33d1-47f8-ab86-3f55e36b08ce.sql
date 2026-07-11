-- Duplicate printer_presets row as explicit 1-Up
INSERT INTO public.printer_presets (
  organization_id, name, label_width, label_height,
  x_offset, y_offset, v_gap, a4_cols, a4_rows,
  label_config, is_default, print_mode, thermal_cols
)
SELECT
  organization_id,
  'jwellery label 100*14 (1UP)',
  label_width, label_height,
  x_offset, y_offset, v_gap, a4_cols, a4_rows,
  label_config,
  false,
  'thermal',
  1
FROM public.printer_presets
WHERE id = '4794440e-1539-4779-acb1-06688cd09272'
  AND NOT EXISTS (
    SELECT 1 FROM public.printer_presets
    WHERE organization_id = '67443f44-6372-4cf3-b017-fddd7e3bb71b'
      AND name = 'jwellery label 100*14 (1UP)'
  );

-- Duplicate barcode_label_settings template row so the Label Designer lists it too
INSERT INTO public.barcode_label_settings (
  organization_id, setting_type, setting_name, setting_data, is_default, created_by
)
SELECT
  organization_id,
  setting_type,
  'jwellery label 100*14 (1UP)',
  setting_data,
  false,
  created_by
FROM public.barcode_label_settings
WHERE id = '3b7a33fe-1994-40d2-8fca-ff36409f881b'
  AND NOT EXISTS (
    SELECT 1 FROM public.barcode_label_settings
    WHERE organization_id = '67443f44-6372-4cf3-b017-fddd7e3bb71b'
      AND setting_type = 'label_template'
      AND setting_name = 'jwellery label 100*14 (1UP)'
  );