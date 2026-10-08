-- Product Entry / Product Edit / Add Product: the one-product-per-name check on Save
-- (findProductNameMatch) used an ilike pattern with % between every letter
-- (%e%l%n%d%u%p%). The trigram index cannot narrow that, so every Save read every
-- product of the shop (avg 635 ms, up to 3.2 s in pg_stat_statements, 2026-10-08).
--
-- Index the compact name key and look it up by equality. Same key as the app's
-- productNameMatchKey (lower case, spaces - _ . / removed). The app falls back to
-- the old ilike lookup while this function is not applied.
--
-- Run off-peak: building the index briefly holds product inserts/updates.

CREATE INDEX IF NOT EXISTS idx_products_org_name_key_active
  ON public.products (organization_id, public.normalize_product_name_key(product_name))
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.find_products_by_name_key(
  p_organization_id uuid,
  p_name text
)
RETURNS TABLE (id uuid, product_name text, created_at timestamptz, total_stock numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id,
    p.product_name::text,
    p.created_at::timestamptz,
    COALESCE((
      SELECT sum(v.stock_qty)
      FROM public.product_variants v
      WHERE v.product_id = p.id
        AND v.deleted_at IS NULL
    ), 0)::numeric
  FROM public.products p
  WHERE p.organization_id = p_organization_id
    AND p.deleted_at IS NULL
    AND public.normalize_product_name_key(p.product_name) = public.normalize_product_name_key(p_name)
  LIMIT 50
$$;

REVOKE ALL ON FUNCTION public.find_products_by_name_key(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_products_by_name_key(uuid, text) TO authenticated, service_role;
