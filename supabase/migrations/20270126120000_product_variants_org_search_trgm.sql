-- Quick Stock, POS delivery challan and barcode sales lookup search variants with
-- one OR of ilike '%text%' over barcode / size / color, always filtered by
-- organization_id. Live (2026-10-15) only color had an org-scoped trigram index
-- (idx_product_variants_org_color_trgm); barcode and size did not, so a search
-- read matches from every shop and then filtered (avg 400 ms, up to 1.6 s).
--
-- Adds the two missing org-scoped indexes, same shape as the color one.
-- Additive only. The unused un-scoped barcode index is dropped separately.
-- Run off-peak.

CREATE INDEX IF NOT EXISTS idx_product_variants_org_barcode_trgm
  ON public.product_variants USING gin (organization_id, barcode gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_product_variants_org_size_trgm
  ON public.product_variants USING gin (organization_id, size gin_trgm_ops)
  WHERE deleted_at IS NULL;
