-- Customer Master search ORs customer_name, phone, email and address; the
-- Customer Payment picker ORs customer_name, phone, gst_number and address.
-- name/phone/email already have trigram indexes, but address and gst_number
-- had none, so one unindexed OR branch made Postgres read every customer of
-- the shop (pg_stat_statements 8 Nov 2026: 275 ms avg, 3.3 s peak, against
-- 8 ms for the same search without address).
--
-- Org-scoped trigram indexes on the two missing columns let Postgres combine
-- all OR branches (BitmapOr). Same shape as idx_sales_org_customer_name_trgm.
-- Additive only: no data or function changes. Run after shop hours.

CREATE INDEX IF NOT EXISTS idx_customers_org_address_trgm
  ON public.customers USING gin (organization_id uuid_ops, address gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org_gst_number_trgm
  ON public.customers USING gin (organization_id uuid_ops, gst_number gin_trgm_ops)
  WHERE deleted_at IS NULL;
