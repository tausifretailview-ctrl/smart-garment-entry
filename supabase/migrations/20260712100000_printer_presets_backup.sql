-- Label design backup & restore for printer_presets.
-- Schema matches live Supabase (org_name + backed_up_at; no backup_type column).

CREATE TABLE IF NOT EXISTS public.printer_presets_backup (
  backup_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id       uuid,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_name        text NOT NULL,
  name            text,
  label_width     numeric,
  label_height    numeric,
  x_offset        numeric,
  y_offset        numeric,
  v_gap           numeric,
  a4_cols         integer,
  a4_rows         integer,
  label_config    jsonb,
  is_default      boolean,
  print_mode      text,
  thermal_cols    integer,
  backed_up_at    timestamptz NOT NULL DEFAULT now(),
  note            text
);

CREATE INDEX IF NOT EXISTS idx_printer_presets_backup_org_backed_up
  ON public.printer_presets_backup (organization_id, backed_up_at DESC);

ALTER TABLE public.printer_presets_backup ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'printer_presets_backup'
      AND policyname = 'Org members can view printer preset backups'
  ) THEN
    CREATE POLICY "Org members can view printer preset backups"
      ON public.printer_presets_backup
      FOR SELECT
      TO authenticated
      USING (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'printer_presets_backup'
      AND policyname = 'Org members can insert printer preset backups'
  ) THEN
    CREATE POLICY "Org members can insert printer preset backups"
      ON public.printer_presets_backup
      FOR INSERT
      TO authenticated
      WITH CHECK (organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      ));
  END IF;
END $$;

GRANT SELECT, INSERT ON public.printer_presets_backup TO authenticated;
