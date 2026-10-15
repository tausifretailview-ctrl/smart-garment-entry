-- POS product search (typing a name) and the Size Stock dialog run one OR of
-- ilike '%text%' over products product_name / brand / category / style /
-- hsn_code / color, filtered by organization_id. The first four already have
-- org-scoped trigram indexes; color and hsn_code had none, so Postgres could not
-- combine the indexes and read every product of the shop instead (Lovable cost
-- report 15 Oct 2026: products search up to 4 s).
--
-- Adds the two missing org-scoped indexes, same shape as idx_products_org_brand_trgm.
-- Additive only. Run off-peak.

CREATE INDEX IF NOT EXISTS idx_products_org_color_trgm
  ON public.products USING gin (organization_id uuid_ops, color extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_org_hsn_code_trgm
  ON public.products USING gin (organization_id uuid_ops, hsn_code extensions.gin_trgm_ops)
  WHERE deleted_at IS NULL;
