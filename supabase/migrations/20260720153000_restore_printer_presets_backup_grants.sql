-- Restore authenticated access to printer_presets_backup.
-- 20260718145856 revoked ALL from authenticated (treating it like a service-only audit log),
-- which broke Label Design Backup / Restore in Barcode Printing.

ALTER TABLE public.printer_presets_backup ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.printer_presets_backup TO authenticated;

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
