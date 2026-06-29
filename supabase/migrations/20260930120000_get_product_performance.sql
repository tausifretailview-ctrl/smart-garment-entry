-- Business Insights Tab 1 (Profitability): product-level performance aggregates.
-- Read-only; org-scoped via p_org_id.

CREATE OR REPLACE FUNCTION public.get_product_performance(
  p_org_id     uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS TABLE (
  product_id          uuid,
  product_name        text,
  brand               text,
  category            text,
  style               text,
  units_sold          numeric,
  revenue             numeric,
  cost                numeric,
  gross_profit        numeric,
  profit_margin_pct   numeric,
  return_qty          numeric,
  return_amount       numeric,
  net_revenue         numeric,
  current_stock       numeric,
  stock_value         numeric,
  last_sold_date      date,
  days_since_sold     integer
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
  WITH product_sales AS (
    SELECT
      p.id                          AS product_id,
      SUM(si.quantity)              AS units_sold,
      SUM(si.line_total)            AS revenue,
      SUM(si.quantity * COALESCE(pv.pur_price, 0)) AS cost,
      MAX(s.sale_date::date)        AS last_sold_date
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
      AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
    GROUP BY p.id
  ),
  product_returns AS (
    SELECT
      p.id                          AS product_id,
      SUM(sri.quantity)             AS return_qty,
      SUM(sri.line_total)           AS return_amount
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
      AND (p_start_date IS NULL OR sr.return_date >= p_start_date)
      AND (p_end_date IS NULL OR sr.return_date <= p_end_date)
    GROUP BY p.id
  ),
  product_stock AS (
    SELECT
      p.id                          AS product_id,
      SUM(pv.stock_qty)             AS current_stock,
      SUM(pv.stock_qty * COALESCE(pv.pur_price, 0)) AS stock_value
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_org_id
      AND p.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND pv.active IS DISTINCT FROM false
      AND p.product_type IS DISTINCT FROM 'service'
    GROUP BY p.id
  )
  SELECT
    p.id                            AS product_id,
    p.product_name,
    p.brand,
    p.category,
    p.style,
    COALESCE(ps.units_sold, 0)      AS units_sold,
    COALESCE(ps.revenue, 0)         AS revenue,
    COALESCE(ps.cost, 0)            AS cost,
    COALESCE(ps.revenue, 0) - COALESCE(ps.cost, 0) AS gross_profit,
    CASE
      WHEN COALESCE(ps.revenue, 0) = 0 THEN 0
      ELSE ROUND(
        (COALESCE(ps.revenue, 0) - COALESCE(ps.cost, 0))
        / COALESCE(ps.revenue, 0) * 100, 2)
    END                             AS profit_margin_pct,
    COALESCE(pr.return_qty, 0)      AS return_qty,
    COALESCE(pr.return_amount, 0)   AS return_amount,
    COALESCE(ps.revenue, 0) - COALESCE(pr.return_amount, 0) AS net_revenue,
    COALESCE(pst.current_stock, 0)  AS current_stock,
    COALESCE(pst.stock_value, 0)    AS stock_value,
    ps.last_sold_date,
    CASE
      WHEN ps.last_sold_date IS NULL THEN NULL
      ELSE (CURRENT_DATE - ps.last_sold_date::date)
    END                             AS days_since_sold
  FROM public.products p
  LEFT JOIN product_sales ps ON ps.product_id = p.id
  LEFT JOIN product_returns pr ON pr.product_id = p.id
  LEFT JOIN product_stock pst ON pst.product_id = p.id
  WHERE p.organization_id = p_org_id
    AND p.deleted_at IS NULL
    AND p.product_type IS DISTINCT FROM 'service'
  ORDER BY (COALESCE(ps.revenue, 0) - COALESCE(ps.cost, 0)) DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_product_performance(uuid, date, date) IS
  'Business Insights: per-product sales, returns, margin, and stock aggregates for an org.';

GRANT EXECUTE ON FUNCTION public.get_product_performance(uuid, date, date) TO authenticated, service_role;
