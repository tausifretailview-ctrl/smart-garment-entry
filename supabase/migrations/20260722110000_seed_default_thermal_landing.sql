-- Seed Bill & Barcode Precision Pro landing mode + default design from each org's
-- current printer_presets.is_default (whatever they use today). Does not overwrite
-- orgs that already have default_thermal_landing set.

WITH ranked AS (
  SELECT DISTINCT ON (pp.organization_id)
    pp.organization_id,
    pp.id AS preset_id,
    CASE
      WHEN pp.print_mode IN ('thermal', 'thermal2up', 'thermal3up') THEN pp.print_mode
      WHEN COALESCE(pp.thermal_cols, 1) >= 3 THEN 'thermal3up'
      WHEN COALESCE(pp.thermal_cols, 1) = 2 THEN 'thermal2up'
      WHEN lower(COALESCE(pp.name, '')) ~ '(3[[:space:]-]*up|3up)' THEN 'thermal3up'
      WHEN lower(COALESCE(pp.name, '')) ~ '(2[[:space:]-]*up|2up)' THEN 'thermal2up'
      ELSE 'thermal'
    END AS landing
  FROM public.printer_presets pp
  WHERE pp.is_default = true
    AND (
      pp.print_mode IS NULL
      OR pp.print_mode IN ('thermal', 'thermal2up', 'thermal3up')
      OR COALESCE(pp.thermal_cols, 1) >= 1
    )
  ORDER BY
    pp.organization_id,
    CASE pp.print_mode
      WHEN 'thermal3up' THEN 1
      WHEN 'thermal2up' THEN 2
      WHEN 'thermal' THEN 3
      ELSE 4
    END,
    pp.updated_at DESC NULLS LAST,
    pp.created_at DESC NULLS LAST
)
UPDATE public.settings s
SET bill_barcode_settings =
  COALESCE(s.bill_barcode_settings, '{}'::jsonb)
  || jsonb_build_object(
    'default_thermal_landing', r.landing,
    'default_precision_preset_id', r.preset_id::text,
    'precision_print_mode', r.landing,
    'barcode_default_print_tab',
      CASE r.landing
        WHEN 'thermal3up' THEN 'precision_3up'
        WHEN 'thermal2up' THEN 'precision_2up'
        ELSE 'precision_1up'
      END
  )
FROM ranked r
WHERE s.organization_id = r.organization_id
  AND (
    s.bill_barcode_settings->>'default_thermal_landing' IS NULL
    OR trim(COALESCE(s.bill_barcode_settings->>'default_thermal_landing', '')) = ''
  );
