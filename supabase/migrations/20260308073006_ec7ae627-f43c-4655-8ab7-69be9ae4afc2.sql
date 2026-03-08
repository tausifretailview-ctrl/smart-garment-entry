-- Check for nulls first
DO $$
DECLARE null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM public.audit_logs WHERE organization_id IS NULL;
  RAISE NOTICE 'Null organization_id count in audit_logs: %', null_count;
END $$;

-- Add composite indexes for org-filtered audit views
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action
  ON public.audit_logs(organization_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity
  ON public.audit_logs(organization_id, entity_type, created_at DESC);