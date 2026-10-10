-- Sales / POS dashboard bill search matches sale_number, customer_name,
-- customer_phone (and salesman on Sales) with one OR of ilike '%text%'.
-- No column had a trigram index, so every search read all of the shop's bills
-- (avg 210-430 ms, up to 1.3 s in pg_stat_statements, 2026-10-10).
--
-- Org-scoped trigram indexes on every OR branch let Postgres combine them
-- (BitmapOr) instead of scanning. Same shape as idx_products_org_name_trgm.
-- Additive only: no data or function changes. Run off-peak.

CREATE INDEX IF NOT EXISTS idx_sales_org_sale_number_trgm
  ON public.sales USING gin (organization_id uuid_ops, sale_number gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_org_customer_name_trgm
  ON public.sales USING gin (organization_id uuid_ops, customer_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_org_customer_phone_trgm
  ON public.sales USING gin (organization_id uuid_ops, customer_phone gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_org_salesman_trgm
  ON public.sales USING gin (organization_id uuid_ops, salesman gin_trgm_ops)
  WHERE deleted_at IS NULL;
