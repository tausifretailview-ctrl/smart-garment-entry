
-- Remove duplicate audit_logs indexes (keep IF NOT EXISTS versions)
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_created_at;
DROP INDEX IF EXISTS idx_audit_logs_entity_id;
DROP INDEX IF EXISTS idx_audit_logs_entity_type;
DROP INDEX IF EXISTS idx_audit_logs_user_id;

-- Recreate them cleanly once
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created
  ON public.audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user
  ON public.audit_logs(user_id);

-- Remove duplicate product_variants barcode index
DROP INDEX IF EXISTS idx_product_variants_barcode;
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode
  ON public.product_variants(barcode) WHERE deleted_at IS NULL;

-- Remove duplicate sales einvoice indexes
DROP INDEX IF EXISTS idx_sales_einvoice_status;
CREATE INDEX IF NOT EXISTS idx_sales_einvoice_status
  ON public.sales(einvoice_status) WHERE einvoice_status IS NOT NULL;
DROP INDEX IF EXISTS idx_sales_irn;
CREATE INDEX IF NOT EXISTS idx_sales_irn
  ON public.sales(irn) WHERE irn IS NOT NULL;
