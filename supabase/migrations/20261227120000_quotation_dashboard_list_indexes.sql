-- Quotation dashboard list: page newest-first without embedding quotation_items.
-- Partial indexes match the org + deleted_at IS NULL filter used by the paged list
-- and the customer dropdown scan.

CREATE INDEX IF NOT EXISTS idx_quotations_org_active_created
  ON public.quotations (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_org_active_customer_name
  ON public.quotations (organization_id, customer_name)
  WHERE deleted_at IS NULL;
