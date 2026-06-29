-- Business Insights Tab 4 (Sales Trends): category-level performance aggregates.
-- Read-only; org-scoped via p_org_id.

CREATE OR REPLACE FUNCTION public.get_category_performance(
  p_org_id     uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS TABLE (
  category            text,
  product_count       bigint,
  units_sold          numeric,
  revenue             numeric,
  cost                numeric,
  gross_profit        numeric,
  profit_margin_pct   numeric,
  stock_value         numeric,
  sell_through_rate   numeric
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
  WITH category_sales AS (
    SELECT
      p.category,
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
      AND p.category IS NOT NULL
      AND btrim(p.category) <> ''
      AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
    GROUP BY p.category
  ),
  category_stock AS (
    SELECT
      p.category,
      SUM(pv.stock_qty)             AS total_stock,
      SUM(pv.stock_qty * COALESCE(pv.pur_price, 0)) AS stock_value
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false
      AND p.product_type IS DISTINCT FROM 'service'
      AND p.category IS NOT NULL
      AND btrim(p.category) <> ''
    GROUP BY p.category
  )
  SELECT
    cs.category,
    cs.product_count,
    COALESCE(cs.units_sold, 0)      AS units_sold,
    COALESCE(cs.revenue, 0)         AS revenue,
    COALESCE(cs.cost, 0)            AS cost,
    COALESCE(cs.revenue, 0) - COALESCE(cs.cost, 0) AS gross_profit,
    CASE
      WHEN COALESCE(cs.revenue, 0) = 0 THEN 0
      ELSE ROUND(
        (COALESCE(cs.revenue, 0) - COALESCE(cs.cost, 0))
        / COALESCE(cs.revenue, 0) * 100, 2)
    END                             AS profit_margin_pct,
    COALESCE(cst.stock_value, 0)    AS stock_value,
    CASE
      WHEN COALESCE(cst.total_stock, 0) = 0
           AND COALESCE(cs.units_sold, 0) = 0 THEN 0
      WHEN (COALESCE(cs.units_sold, 0) + COALESCE(cst.total_stock, 0)) = 0 THEN 0
      ELSE ROUND(
        COALESCE(cs.units_sold, 0)
        / (COALESCE(cs.units_sold, 0) + COALESCE(cst.total_stock, 0))
        * 100, 2)
    END                             AS sell_through_rate
  FROM category_sales cs
  LEFT JOIN category_stock cst ON cst.category = cs.category
  ORDER BY (COALESCE(cs.revenue, 0) - COALESCE(cs.cost, 0)) DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_category_performance(uuid, date, date) IS
  'Business Insights: per-category sales, margin, stock value, and sell-through rate.';

GRANT EXECUTE ON FUNCTION public.get_category_performance(uuid, date, date) TO authenticated, service_role;
