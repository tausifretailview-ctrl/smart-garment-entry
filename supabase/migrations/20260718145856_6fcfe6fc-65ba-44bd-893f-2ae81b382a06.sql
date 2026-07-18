-- 1) Enable RLS on backup/audit tables; restrict to service_role (no user access)
ALTER TABLE public.credit_repair_log_20260713 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.credit_repair_log_20260713 FROM anon, authenticated;

ALTER TABLE public.printer_presets_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.printer_presets_backup FROM anon, authenticated;

-- 2) Fix mutable search_path on invoice_reconcile_outstanding
ALTER FUNCTION public.invoice_reconcile_outstanding(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) SET search_path = public;

-- 3) Standardize admin policies to use has_org_role() helper
DROP POLICY IF EXISTS "Admins can manage label backups" ON public.organization_label_templates_backup;
CREATE POLICY "Admins can manage label backups"
  ON public.organization_label_templates_backup
  FOR ALL
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (public.has_org_role(auth.uid(), organization_id, 'admin'::app_role));

DROP POLICY IF EXISTS admins_can_update_organizations ON public.organizations;
CREATE POLICY admins_can_update_organizations
  ON public.organizations
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_org_role(auth.uid(), id, 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_admin'::app_role)
    OR public.has_org_role(auth.uid(), id, 'admin'::app_role)
  );
