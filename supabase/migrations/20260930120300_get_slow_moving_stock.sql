-- Business Insights Tab 2 (Stock Health): variants with stock but no recent sales.
-- Read-only; org-scoped via p_org_id.

CREATE OR REPLACE FUNCTION public.get_slow_moving_stock(
  p_org_id         uuid,
  p_days_threshold integer DEFAULT 60
)
RETURNS TABLE (
  variant_id         uuid,
  product_id         uuid,
  product_name       text,
  brand              text,
  category           text,
  size               text,
  color              text,
  barcode            text,
  current_stock      numeric,
  stock_value        numeric,
  last_sold_date     date,
  days_since_sold    integer,
  total_sold_ever    numeric
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
  WITH last_sale AS (
    SELECT
      si.variant_id,
      MAX(s.sale_date::date)        AS last_sold_date,
      SUM(si.quantity)              AS total_sold_ever
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  )
  SELECT
    pv.id                           AS variant_id,
    p.id                            AS product_id,
    p.product_name,
    p.brand,
    p.category,
    pv.size,
    pv.color,
    pv.barcode,
    pv.stock_qty::numeric           AS current_stock,
    (pv.stock_qty * COALESCE(pv.pur_price, 0))::numeric AS stock_value,
    ls.last_sold_date,
    CASE
      WHEN ls.last_sold_date IS NULL THEN NULL
      ELSE (CURRENT_DATE - ls.last_sold_date::date)
    END                             AS days_since_sold,
    COALESCE(ls.total_sold_ever, 0) AS total_sold_ever
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  LEFT JOIN last_sale ls ON ls.variant_id = pv.id
  WHERE pv.organization_id = p_org_id
    AND p.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active IS DISTINCT FROM false
    AND pv.stock_qty > 0
    AND p.product_type IS DISTINCT FROM 'service'
    AND (
      ls.last_sold_date IS NULL
      OR ls.last_sold_date < CURRENT_DATE - p_days_threshold
    )
  ORDER BY (pv.stock_qty * COALESCE(pv.pur_price, 0)) DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_slow_moving_stock(uuid, integer) IS
  'Business Insights: in-stock variants with no sale within p_days_threshold days (or never sold).';

GRANT EXECUTE ON FUNCTION public.get_slow_moving_stock(uuid, integer) TO authenticated, service_role;
