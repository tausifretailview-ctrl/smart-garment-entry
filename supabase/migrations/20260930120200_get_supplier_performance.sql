-- Business Insights Tab 3 (Supplier Analysis): supplier purchase vs sell-through aggregates.
-- Read-only; org-scoped via p_org_id.

CREATE OR REPLACE FUNCTION public.get_supplier_performance(
  p_org_id     uuid,
  p_start_date date DEFAULT NULL,
  p_end_date   date DEFAULT NULL
)
RETURNS TABLE (
  supplier_id           uuid,
  supplier_name         text,
  total_purchased       numeric,
  bill_count            bigint,
  units_purchased       numeric,
  units_sold            numeric,
  sell_through_rate_pct numeric,
  return_to_supplier    numeric,
  current_stock_value   numeric
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
  WITH supplier_purchases AS (
    SELECT
      pb.supplier_id,
      COUNT(DISTINCT pb.id)         AS bill_count,
      SUM(pb.net_amount)            AS total_purchased,
      SUM(pi.qty)                   AS units_purchased
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND COALESCE(pb.is_cancelled, false) = false
      AND pb.supplier_id IS NOT NULL
      AND (p_start_date IS NULL OR pb.bill_date >= p_start_date)
      AND (p_end_date IS NULL OR pb.bill_date <= p_end_date)
    GROUP BY pb.supplier_id
  ),
  variant_primary_supplier AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id                     AS variant_id,
      pb.supplier_id
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND COALESCE(pb.is_cancelled, false) = false
      AND pi.sku_id IS NOT NULL
      AND pb.supplier_id IS NOT NULL
    ORDER BY pi.sku_id, pb.bill_date DESC, pb.created_at DESC
  ),
  supplier_sales AS (
    SELECT
      vps.supplier_id,
      SUM(si.quantity)              AS units_sold
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    INNER JOIN variant_primary_supplier vps ON vps.variant_id = si.variant_id
    WHERE s.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND si.variant_id IS NOT NULL
      AND (p_start_date IS NULL OR s.sale_date >= p_start_date)
      AND (p_end_date IS NULL OR s.sale_date <= p_end_date)
    GROUP BY vps.supplier_id
  ),
  supplier_returns AS (
    SELECT
      COALESCE(pb.supplier_id, pr.supplier_id) AS supplier_id,
      SUM(pri.qty)                  AS return_qty
    FROM public.purchase_return_items pri
    INNER JOIN public.purchase_returns pr ON pr.id = pri.return_id
    LEFT JOIN public.purchase_bills pb ON pb.id = pr.linked_bill_id
    WHERE pr.organization_id = p_org_id
      AND pri.deleted_at IS NULL
      AND pr.deleted_at IS NULL
      AND COALESCE(pr.supplier_id, pb.supplier_id) IS NOT NULL
      AND (p_start_date IS NULL OR pr.return_date >= p_start_date)
      AND (p_end_date IS NULL OR pr.return_date <= p_end_date)
    GROUP BY COALESCE(pb.supplier_id, pr.supplier_id)
  ),
  supplier_stock AS (
    SELECT
      vps.supplier_id,
      SUM(pv.stock_qty * COALESCE(pv.pur_price, 0)) AS stock_value
    FROM variant_primary_supplier vps
    INNER JOIN public.product_variants pv ON pv.id = vps.variant_id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
    GROUP BY vps.supplier_id
  )
  SELECT
    sp.supplier_id,
    sup.supplier_name,
    COALESCE(sp.total_purchased, 0) AS total_purchased,
    COALESCE(sp.bill_count, 0)      AS bill_count,
    COALESCE(sp.units_purchased, 0)  AS units_purchased,
    COALESCE(ss.units_sold, 0)        AS units_sold,
    CASE
      WHEN COALESCE(sp.units_purchased, 0) = 0 THEN 0
      ELSE ROUND(
        COALESCE(ss.units_sold, 0) / sp.units_purchased * 100, 2)
    END                             AS sell_through_rate_pct,
    COALESCE(sr.return_qty, 0)      AS return_to_supplier,
    COALESCE(sst.stock_value, 0)      AS current_stock_value
  FROM supplier_purchases sp
  INNER JOIN public.suppliers sup
    ON sup.id = sp.supplier_id
   AND sup.organization_id = p_org_id
   AND sup.deleted_at IS NULL
  LEFT JOIN supplier_sales ss ON ss.supplier_id = sp.supplier_id
  LEFT JOIN supplier_returns sr ON sr.supplier_id = sp.supplier_id
  LEFT JOIN supplier_stock sst ON sst.supplier_id = sp.supplier_id
  ORDER BY COALESCE(sp.total_purchased, 0) DESC NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.get_supplier_performance(uuid, date, date) IS
  'Business Insights: supplier purchase volume, sell-through, returns, and attributed stock value.';

GRANT EXECUTE ON FUNCTION public.get_supplier_performance(uuid, date, date) TO authenticated, service_role;
