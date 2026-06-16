CREATE INDEX IF NOT EXISTS idx_products_org_status_name
  ON public.products (organization_id, status, product_name)
  WHERE deleted_at IS NULL;