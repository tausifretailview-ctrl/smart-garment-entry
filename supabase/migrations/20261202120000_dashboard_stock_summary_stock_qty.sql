-- Phase 7: StatusBar stock tile sums product_variants.stock_qty
-- (authoritative on-hand). Phase 2 copied the live view body which still
-- aggregated legacy current_stock. Output columns unchanged.

CREATE OR REPLACE FUNCTION public.get_dashboard_stock_summary(p_org_id uuid)
RETURNS TABLE (
  organization_id     uuid,
  total_stock_qty     bigint,
  total_stock_value   numeric,
  total_sale_value    numeric,
  total_variant_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pv.organization_id,
    COALESCE(SUM(pv.stock_qty), 0)::bigint AS total_stock_qty,
    COALESCE(SUM(pv.stock_qty::numeric * COALESCE(pv.pur_price, 0)), 0)::numeric AS total_stock_value,
    COALESCE(SUM(pv.stock_qty::numeric * COALESCE(pv.sale_price, 0)), 0)::numeric AS total_sale_value,
    COUNT(*)::int AS total_variant_count
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active = true
    AND p.product_type != 'service'
  GROUP BY pv.organization_id;
END;
$$;

COMMENT ON FUNCTION public.get_dashboard_stock_summary(uuid) IS
  'Org-scoped stock tile for StatusBar. Aggregates product_variants.stock_qty (authoritative on-hand), not legacy current_stock. SECURITY DEFINER, fail-closed auth.role() guard.';

REVOKE ALL ON FUNCTION public.get_dashboard_stock_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stock_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stock_summary(uuid) TO authenticated, service_role;
