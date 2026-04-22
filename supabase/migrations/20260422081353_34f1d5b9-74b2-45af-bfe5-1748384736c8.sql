DROP FUNCTION IF EXISTS public.detect_stock_discrepancies(uuid);

CREATE OR REPLACE FUNCTION public.detect_stock_discrepancies(
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE(
  variant_id uuid, product_name text, size text, color text,
  current_stock numeric, expected_stock numeric,
  discrepancy numeric, last_purchase date, last_sale date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  org_filter AS (
    SELECT COALESCE(p_organization_id,
      (SELECT id FROM organizations LIMIT 1)) AS oid
  ),
  purchased AS (
    SELECT pi.variant_id, COALESCE(SUM(pi.quantity), 0) AS qty,
           MAX(pb.bill_date) AS last_date
    FROM purchase_items pi
    JOIN purchase_bills pb ON pi.bill_id = pb.id
    CROSS JOIN org_filter
    WHERE pb.organization_id = org_filter.oid
      AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL
    GROUP BY pi.variant_id
  ),
  sold AS (
    SELECT si.variant_id, COALESCE(SUM(si.quantity), 0) AS qty,
           MAX(s.sale_date) AS last_date
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    CROSS JOIN org_filter
    WHERE s.organization_id = org_filter.oid
      AND si.deleted_at IS NULL AND s.deleted_at IS NULL
      AND s.is_cancelled = false
    GROUP BY si.variant_id
  ),
  purchase_returned AS (
    SELECT pri.variant_id, COALESCE(SUM(pri.quantity), 0) AS qty
    FROM purchase_return_items pri
    JOIN purchase_returns pr ON pri.return_id = pr.id
    CROSS JOIN org_filter
    WHERE pr.organization_id = org_filter.oid
      AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL
    GROUP BY pri.variant_id
  ),
  sale_returned AS (
    SELECT sri.variant_id, COALESCE(SUM(sri.quantity), 0) AS qty
    FROM sale_return_items sri
    JOIN sale_returns sr ON sri.return_id = sr.id
    CROSS JOIN org_filter
    WHERE sr.organization_id = org_filter.oid
      AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL
    GROUP BY sri.variant_id
  ),
  challan_qty AS (
    SELECT dci.variant_id, COALESCE(SUM(dci.quantity), 0) AS qty
    FROM delivery_challan_items dci
    JOIN delivery_challans dc ON dci.challan_id = dc.id
    CROSS JOIN org_filter
    WHERE dc.organization_id = org_filter.oid
      AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL
      AND dc.status = 'delivered'
    GROUP BY dci.variant_id
  ),
  adjusted AS (
    SELECT sa.variant_id,
           COALESCE(SUM(CASE WHEN sa.adjustment_type = 'add'
             THEN sa.quantity_adjusted ELSE -sa.quantity_adjusted END), 0) AS qty
    FROM stock_adjustments sa
    CROSS JOIN org_filter
    WHERE sa.organization_id = org_filter.oid
      AND sa.deleted_at IS NULL
    GROUP BY sa.variant_id
  )
  SELECT
    pv.id AS variant_id,
    p.product_name,
    pv.size,
    pv.color,
    pv.stock_qty AS current_stock,
    ROUND(
      COALESCE(pu.qty, 0)
      - COALESCE(so.qty, 0)
      + COALESCE(sr.qty, 0)
      - COALESCE(pr.qty, 0)
      - COALESCE(ch.qty, 0)
      + COALESCE(adj.qty, 0)
      + COALESCE(pv.opening_stock, 0)
    ) AS expected_stock,
    pv.stock_qty - ROUND(
      COALESCE(pu.qty, 0)
      - COALESCE(so.qty, 0)
      + COALESCE(sr.qty, 0)
      - COALESCE(pr.qty, 0)
      - COALESCE(ch.qty, 0)
      + COALESCE(adj.qty, 0)
      + COALESCE(pv.opening_stock, 0)
    ) AS discrepancy,
    pu.last_date AS last_purchase,
    so.last_date AS last_sale
  FROM product_variants pv
  JOIN products p ON pv.product_id = p.id
  CROSS JOIN org_filter
  LEFT JOIN purchased pu ON pv.id = pu.variant_id
  LEFT JOIN sold so ON pv.id = so.variant_id
  LEFT JOIN purchase_returned pr ON pv.id = pr.variant_id
  LEFT JOIN sale_returned sr ON pv.id = sr.variant_id
  LEFT JOIN challan_qty ch ON pv.id = ch.variant_id
  LEFT JOIN adjusted adj ON pv.id = adj.variant_id
  WHERE p.organization_id = org_filter.oid
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
  ORDER BY ABS(pv.stock_qty - ROUND(
    COALESCE(pu.qty, 0) - COALESCE(so.qty, 0) + COALESCE(sr.qty, 0)
    - COALESCE(pr.qty, 0) - COALESCE(ch.qty, 0) + COALESCE(adj.qty, 0)
    + COALESCE(pv.opening_stock, 0)
  )) DESC;
END;
$$;