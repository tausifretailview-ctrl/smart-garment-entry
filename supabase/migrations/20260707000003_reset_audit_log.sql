-- Audit trail for organization data resets (replaces invalid backup_logs reset rows).

CREATE TABLE public.organization_reset_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  performed_by uuid NOT NULL,
  confirmation_name text NOT NULL,
  tables_cleared jsonb,
  errors jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_organization_reset_audit_org
  ON public.organization_reset_audit (organization_id, created_at DESC);

ALTER TABLE public.organization_reset_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view reset audit for their organization"
  ON public.organization_reset_audit
  FOR SELECT
  TO authenticated
  USING (user_belongs_to_org(auth.uid(), organization_id));

GRANT SELECT ON public.organization_reset_audit TO authenticated;
