-- Industrial mode, Phase 1 step 7: alternate unit and reorder level on items.
-- Nullable columns, no defaults: existing products and retail shops are unchanged.
-- Written only from Product Entry when Industrial mode is on.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alt_uom text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS alt_uom_factor numeric(14,4);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS reorder_level numeric(14,3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_alt_uom_factor_positive') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_alt_uom_factor_positive CHECK (alt_uom_factor IS NULL OR alt_uom_factor > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_reorder_level_non_negative') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_reorder_level_non_negative CHECK (reorder_level IS NULL OR reorder_level >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_org_reorder_level
  ON public.products (organization_id)
  WHERE reorder_level IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.products.alt_uom IS 'Industrial mode: alternate unit, e.g. BOX';
COMMENT ON COLUMN public.products.alt_uom_factor IS 'Industrial mode: main units in 1 alternate unit (1 BOX = 12 NOS)';
COMMENT ON COLUMN public.products.reorder_level IS 'Industrial mode: reorder when stock falls below this (main unit)';
