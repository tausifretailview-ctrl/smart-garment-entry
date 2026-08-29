-- Category tier rules are per (category + single-unit price), not category alone.
-- Track Pants @ ₹300 and Track Pants @ ₹600 are independent product lines.
--
-- Existing rows stay valid: the previous uniques were stricter (one row per
-- category per org / per scheme). Widening the key cannot collide or duplicate
-- those rows. No data rewrite.

DROP INDEX IF EXISTS public.category_quantity_tier_pricing_org_category_uidx;
DROP INDEX IF EXISTS public.category_quantity_tier_pricing_scheme_category_uidx;

-- Orphan rows (no scheme yet): one rule per org + category + price.
CREATE UNIQUE INDEX IF NOT EXISTS category_quantity_tier_pricing_org_category_price_uidx
  ON public.category_quantity_tier_pricing (
    organization_id,
    lower(trim(category)),
    single_unit_price
  )
  WHERE scheme_id IS NULL;

-- Scheme rows: same category + price may exist once per scheme.
CREATE UNIQUE INDEX IF NOT EXISTS category_quantity_tier_pricing_scheme_category_price_uidx
  ON public.category_quantity_tier_pricing (
    scheme_id,
    lower(trim(category)),
    single_unit_price
  )
  WHERE scheme_id IS NOT NULL;

COMMENT ON TABLE public.category_quantity_tier_pricing IS
  'Per-org/scheme category+unit-price bundle pricing: tier_qty items for tier_total_price; remainder at single_unit_price. A category may have multiple rules, one per single_unit_price.';
