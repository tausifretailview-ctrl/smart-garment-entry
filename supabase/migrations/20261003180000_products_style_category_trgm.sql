-- Trigram indexes for style/category product search (Quick Stock Check, POS, Sale Invoice, etc.).
-- product_name and brand already have idx_products_name_trgm / idx_products_brand_trgm.

CREATE INDEX IF NOT EXISTS idx_products_style_trgm
  ON public.products USING gin (style gin_trgm_ops)
  WHERE deleted_at IS NULL AND style IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_trgm
  ON public.products USING gin (category gin_trgm_ops)
  WHERE deleted_at IS NULL AND category IS NOT NULL;
