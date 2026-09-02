-- Business Insights: Reorder Analysis.
-- Modelled on get_low_stock_alerts velocity + last-purchase CTEs, with:
--   * parameterized lookback (not hardcoded 30 days)
--   * all variants with sales in the period (not stock-threshold filtered)
--   * suggested reorder qty = max(0, round(avg_daily_sales * 35 - on_hand))
--     (30-day cover + 5-day safety buffer). Vendor lead time is not in this
--     schema — omitted from v1 rather than invented.
-- Auth: fail-closed via auth.role() (do not copy the uid-IS-NOT-NULL skip).

CREATE OR REPLACE FUNCTION public.get_reorder_analysis(
  p_org_id      uuid,
  p_period_days integer DEFAULT 120,
  p_category    text DEFAULT NULL
)
RETURNS TABLE (
  variant_id            uuid,
  product_id            uuid,
  product_name          text,
  brand                 text,
  category              text,
  size                  text,
  color                 text,
  barcode               text,
  current_stock         numeric,
  avg_daily_sales       numeric,
  days_of_stock_left    numeric,
  last_purchase_date    date,
  primary_supplier_id   uuid,
  primary_supplier      text,
  suggested_reorder_qty numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  v_period := GREATEST(1, LEAST(COALESCE(p_period_days, 120), 730));

  RETURN QUERY
  WITH daily_sales AS (
    SELECT
      si.variant_id,
      SUM(si.quantity)::numeric
        / GREATEST(CURRENT_DATE - MIN(s.sale_date::date), 1) AS avg_daily_sales
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND si.variant_id IS NOT NULL
      AND s.sale_date::date >= CURRENT_DATE - v_period
    GROUP BY si.variant_id
  ),
  last_purchase AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id AS variant_id,
      pb.bill_date AS last_purchase_date,
      pb.supplier_id,
      COALESCE(sup.supplier_name, pb.supplier_name) AS primary_supplier
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    LEFT JOIN public.suppliers sup ON sup.id = pb.supplier_id
    WHERE pb.organization_id = p_org_id
      AND pi.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND COALESCE(pb.is_cancelled, false) = false
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pb.bill_date DESC, pb.created_at DESC
  )
  SELECT
    pv.id,
    p.id,
    p.product_name,
    p.brand,
    p.category,
    pv.size,
    pv.color,
    pv.barcode,
    pv.stock_qty::numeric,
    COALESCE(ds.avg_daily_sales, 0),
    CASE WHEN COALESCE(ds.avg_daily_sales, 0) = 0 THEN NULL
         ELSE ROUND(pv.stock_qty / ds.avg_daily_sales, 1) END,
    lp.last_purchase_date,
    lp.supplier_id,
    lp.primary_supplier,
    GREATEST(
      0,
      ROUND(COALESCE(ds.avg_daily_sales, 0) * 35 - pv.stock_qty, 0)
    )
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  LEFT JOIN daily_sales ds ON ds.variant_id = pv.id
  LEFT JOIN last_purchase lp ON lp.variant_id = pv.id
  WHERE pv.organization_id = p_org_id
    AND p.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active IS DISTINCT FROM false
    AND p.product_type IS DISTINCT FROM 'service'
    AND ds.avg_daily_sales IS NOT NULL
    AND (p_category IS NULL OR p.category = p_category)
  ORDER BY
    CASE WHEN COALESCE(ds.avg_daily_sales, 0) = 0 THEN 9999
         ELSE pv.stock_qty / ds.avg_daily_sales END ASC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_reorder_analysis(uuid, integer, text) IS
  'Business Insights Reorder Analysis: variants with sales in p_period_days, 35-day cover suggestion. Fail-closed org guard.';

REVOKE EXECUTE ON FUNCTION public.get_reorder_analysis(uuid, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_reorder_analysis(uuid, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_reorder_analysis(uuid, integer, text) TO authenticated, service_role;
