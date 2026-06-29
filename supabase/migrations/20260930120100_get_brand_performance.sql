-- Business Insights Tab 1 (Profitability): brand-level performance aggregates.
-- Read-only; org-scoped via p_org_id.

CREATE OR REPLACE FUNCTION public.get_brand_performance(
  p_org_id     uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS TABLE (
  brand               text,
  product_count       bigint,
  units_sold          numeric,
  revenue             numeric,
  cost                numeric,
  gross_profit        numeric,
  profit_margin_pct   numeric,
  return_qty          numeric,
  return_rate_pct     numeric,
  current_stock_value numeric
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

  IF auth.uid() IS NOT NULL THEN
    IF NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH brand_sales AS (
    SELECT
      p.brand,
      COUNT(DISTINCT p.id)          AS product_count,
      SUM(si.quantity)              AS units_sold,
      SUM(si.line_total)            AS revenue,
      SUM(si.quantity * COALESCE(pv.pur_price, 0)) AS cost
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    INNER JOIN public.product_variants pv ON pv.id = si.variant_id
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE s.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND p.brand IS NOT NULL
      AND btrim(p.brand) <> ''
      AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
    GROUP BY p.brand
  ),
  brand_returns AS (
    SELECT
      p.brand,
      SUM(sri.quantity)             AS return_qty
    FROM public.sale_return_items sri
    INNER JOIN public.sale_returns sr ON sr.id = sri.return_id
    INNER JOIN public.product_variants pv ON pv.id = sri.variant_id
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE sr.organization_id = p_org_id
      AND pv.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND sri.deleted_at IS NULL
      AND sr.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND p.brand IS NOT NULL
      AND btrim(p.brand) <> ''
      AND (p_start_date IS NULL OR sr.return_date >= p_start_date)
      AND (p_end_date IS NULL OR sr.return_date <= p_end_date)
    GROUP BY p.brand
  ),
  brand_stock AS (
    SELECT
      p.brand,
      SUM(pv.stock_qty * COALESCE(pv.pur_price, 0)) AS stock_value
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false
      AND p.product_type IS DISTINCT FROM 'service'
      AND p.brand IS NOT NULL
      AND btrim(p.brand) <> ''
    GROUP BY p.brand
  )
  SELECT
    bs.brand,
    bs.product_count,
    COALESCE(bs.units_sold, 0)      AS units_sold,
    COALESCE(bs.revenue, 0)         AS revenue,
    COALESCE(bs.cost, 0)            AS cost,
    COALESCE(bs.revenue, 0) - COALESCE(bs.cost, 0) AS gross_profit,
    CASE
      WHEN COALESCE(bs.revenue, 0) = 0 THEN 0
      ELSE ROUND(
        (COALESCE(bs.revenue, 0) - COALESCE(bs.cost, 0))
        / COALESCE(bs.revenue, 0) * 100, 2)
    END                             AS profit_margin_pct,
    COALESCE(br.return_qty, 0)      AS return_qty,
    CASE
      WHEN COALESCE(bs.units_sold, 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(br.return_qty, 0) / bs.units_sold * 100, 2)
    END                             AS return_rate_pct,
    COALESCE(bst.stock_value, 0)    AS current_stock_value
  FROM brand_sales bs
  LEFT JOIN brand_returns br ON br.brand = bs.brand
  LEFT JOIN brand_stock bst ON bst.brand = bs.brand
  ORDER BY (COALESCE(bs.revenue, 0) - COALESCE(bs.cost, 0)) DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_brand_performance(uuid, date, date) IS
  'Business Insights: per-brand sales, returns, margin, and stock value aggregates for an org.';

GRANT EXECUTE ON FUNCTION public.get_brand_performance(uuid, date, date) TO authenticated, service_role;
