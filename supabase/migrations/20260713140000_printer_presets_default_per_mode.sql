-- One default preset per organization per print_mode (not one global default per org).

-- Normalize null print_mode before indexing (legacy rows).
UPDATE public.printer_presets
SET print_mode = 'thermal', updated_at = now()
WHERE print_mode IS NULL OR TRIM(print_mode) = '';

-- If duplicate defaults exist for the same org+mode, keep the most recently updated.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    WITH ranked AS (
      SELECT
        id,
        organization_id,
        print_mode,
        name,
        ROW_NUMBER() OVER (
          PARTITION BY organization_id, print_mode
          ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM public.printer_presets
      WHERE is_default IS TRUE
    )
    SELECT id, organization_id, print_mode, name
    FROM ranked
    WHERE rn > 1
  LOOP
    UPDATE public.printer_presets
    SET is_default = false, updated_at = now()
    WHERE id = r.id;

    RAISE NOTICE 'Unset duplicate default: preset "%" (id=%) org=% mode=%',
      r.name, r.id, r.organization_id, r.print_mode;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_printer_presets_default_per_mode
  ON public.printer_presets (organization_id, print_mode)
  WHERE is_default = true;
