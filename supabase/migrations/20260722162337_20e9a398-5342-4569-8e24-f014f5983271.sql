-- Restore Ranawat's Bling printer presets from most recent backups (accidentally deleted)
WITH latest AS (
  SELECT DISTINCT ON (preset_id)
    preset_id, organization_id, name, label_width, label_height, x_offset, y_offset,
    v_gap, h_gap, a4_cols, a4_rows, label_config, is_default, print_mode, thermal_cols, backed_up_at
  FROM printer_presets_backup
  WHERE organization_id='67443f44-6372-4cf3-b017-fddd7e3bb71b'
  ORDER BY preset_id, backed_up_at DESC
)
INSERT INTO printer_presets (
  id, organization_id, name, label_width, label_height, x_offset, y_offset,
  v_gap, h_gap, a4_cols, a4_rows, label_config, is_default, print_mode, thermal_cols,
  created_at, updated_at
)
SELECT preset_id, organization_id, name, label_width, label_height,
       COALESCE(x_offset,0), COALESCE(y_offset,0), COALESCE(v_gap,0), COALESCE(h_gap,0),
       COALESCE(a4_cols,1), COALESCE(a4_rows,1), label_config, is_default,
       print_mode, thermal_cols, now(), now()
FROM latest
ON CONFLICT (id) DO NOTHING;

-- Ensure only one default: prefer the 3-up thermal preset the user asked to restore
UPDATE printer_presets SET is_default=false
 WHERE organization_id='67443f44-6372-4cf3-b017-fddd7e3bb71b';
UPDATE printer_presets SET is_default=true, updated_at=now()
 WHERE id='324b1e4c-7682-4223-bac9-29c7ed1de4eb';