CREATE INDEX IF NOT EXISTS idx_sales_org_customer_date_active
  ON public.sales (organization_id, customer_id, sale_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_org_type_date_active
  ON public.sales (organization_id, sale_type, sale_date DESC)
  WHERE deleted_at IS NULL;