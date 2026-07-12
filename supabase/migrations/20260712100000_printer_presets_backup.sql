-- Label design backup & restore for printer_presets.
-- Auto-backups on UPDATE (label_config change) / DELETE; manual backups from UI.

CREATE TABLE public.printer_presets_backup (
  backup_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id       uuid,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
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
  backup_type     text NOT NULL CHECK (backup_type IN ('auto', 'manual')),
  note            text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_printer_presets_backup_org_created
  ON public.printer_presets_backup (organization_id, created_at DESC);

ALTER TABLE public.printer_presets_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view printer preset backups"
  ON public.printer_presets_backup
  FOR SELECT
  TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert printer preset backups"
  ON public.printer_presets_backup
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT ON public.printer_presets_backup TO authenticated;

-- Auto-backup trigger: preserve OLD row before UPDATE (label_config change) or DELETE.
CREATE OR REPLACE FUNCTION public.backup_printer_preset_before_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Skip noise from calibration-only edits (offset/gap/dimensions without design change).
    IF OLD.label_config IS NOT DISTINCT FROM NEW.label_config THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.printer_presets_backup (
    preset_id,
    organization_id,
    name,
    label_width,
    label_height,
    x_offset,
    y_offset,
    v_gap,
    a4_cols,
    a4_rows,
    label_config,
    is_default,
    print_mode,
    thermal_cols,
    backup_type,
    note,
    created_by
  ) VALUES (
    OLD.id,
    OLD.organization_id,
    OLD.name,
    OLD.label_width,
    OLD.label_height,
    OLD.x_offset,
    OLD.y_offset,
    OLD.v_gap,
    OLD.a4_cols,
    OLD.a4_rows,
    OLD.label_config,
    OLD.is_default,
    OLD.print_mode,
    OLD.thermal_cols,
    'auto',
    NULL,
    auth.uid()
  );

  -- Retention: keep newest 20 auto backups per org; never delete manual backups.
  DELETE FROM public.printer_presets_backup b
  WHERE b.organization_id = OLD.organization_id
    AND b.backup_type = 'auto'
    AND b.backup_id NOT IN (
      SELECT backup_id
      FROM public.printer_presets_backup
      WHERE organization_id = OLD.organization_id
        AND backup_type = 'auto'
      ORDER BY created_at DESC
      LIMIT 20
    );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_printer_presets_backup
  BEFORE UPDATE OR DELETE ON public.printer_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.backup_printer_preset_before_change();

-- Migrate legacy organization_label_templates_backup rows if any exist.
INSERT INTO public.printer_presets_backup (
  organization_id,
  name,
  label_width,
  label_height,
  x_offset,
  y_offset,
  v_gap,
  label_config,
  is_default,
  print_mode,
  thermal_cols,
  backup_type,
  note,
  created_at
)
SELECT
  o.organization_id,
  o.template_name,
  COALESCE((o.template_config->>'labelWidth')::numeric, 50),
  COALESCE((o.template_config->>'labelHeight')::numeric, 25),
  0,
  0,
  2,
  COALESCE(o.template_config->'config', o.template_config),
  COALESCE(o.is_default, false),
  'thermal',
  1,
  'manual',
  COALESCE(o.description, 'Migrated from organization_label_templates_backup'),
  o.created_at
FROM public.organization_label_templates_backup o
WHERE EXISTS (SELECT 1 FROM public.organization_label_templates_backup LIMIT 1);
