-- Quick Stock, POS delivery challan and barcode sales lookup search variants with
-- one OR of ilike '%text%' over barcode / size / color, always filtered by
-- organization_id. The existing trigram indexes on those columns are not
-- org-scoped, so a search reads matches from every shop and then filters
-- (avg 400 ms, up to 1.6 s in pg_stat_statements, 2026-10-15).
--
-- Org-scoped trigram indexes, same shape as idx_sales_org_*_trgm (20270120120000).
-- Additive only. The old un-scoped indexes are dropped separately, once their
-- scan count shows nothing uses them any more. Run off-peak.

CREATE INDEX IF NOT EXISTS idx_variants_org_barcode_trgm
  ON public.product_variants USING gin (organization_id uuid_ops, barcode gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_variants_org_size_trgm
  ON public.product_variants USING gin (organization_id uuid_ops, size gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_variants_org_color_trgm
  ON public.product_variants USING gin (organization_id uuid_ops, color gin_trgm_ops)
  WHERE deleted_at IS NULL;
