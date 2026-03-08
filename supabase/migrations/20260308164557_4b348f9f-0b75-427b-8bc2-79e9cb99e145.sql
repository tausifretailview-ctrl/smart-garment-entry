
CREATE INDEX IF NOT EXISTS idx_variants_color_trgm
  ON public.product_variants USING GIN (color public.gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_variants_size_trgm
  ON public.product_variants USING GIN (size public.gin_trgm_ops)
  WHERE deleted_at IS NULL;
