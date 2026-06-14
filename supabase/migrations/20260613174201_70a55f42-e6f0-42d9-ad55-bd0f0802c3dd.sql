CREATE INDEX IF NOT EXISTS idx_products_org_status_active
  ON public.products (organization_id, status)
  WHERE deleted_at IS NULL;