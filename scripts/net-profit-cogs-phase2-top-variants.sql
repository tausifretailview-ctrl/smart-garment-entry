-- Phase 2 §1 — Top variants by COGS (FAST, single statement)
-- Run the ENTIRE file in SQL Editor (Ctrl+A in this tab, then Run).
-- Change org_id / dates only in params.
--
-- Skips §5-full (often times out). Uses net_after_discount || line_total like §5-lite.
-- Purchase avg: RPC-style (all purchase_items rows for SKU) + org-bills-only for drift.

WITH params AS (
  SELECT
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id,  -- KS Footwear
    '2026-09-01'::date AS d_from,
    '2026-09-30'::date AS d_to
),
bounds AS (
  SELECT
    (d_from::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    (d_to::text || 'T23:59:59.999+05:30')::timestamptz AS v_to,
    org_id
  FROM params
),
period_sales AS (
  SELECT s.id
  FROM public.sales s
  CROSS JOIN bounds b
  WHERE s.organization_id = b.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
    AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
    AND s.sale_date >= b.v_from
    AND s.sale_date <= b.v_to
),
by_variant AS (
  SELECT
    si.variant_id,
    SUM(COALESCE(si.quantity, 0))::numeric AS qty_sold,
    SUM(COALESCE(si.net_after_discount::numeric, si.line_total, 0))::numeric AS net_sales
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN params p
  WHERE si.deleted_at IS NULL
    AND si.organization_id = p.org_id
    AND si.variant_id IS NOT NULL
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
  GROUP BY si.variant_id
),
-- Limit purchase_items scan: variants with highest qty in period (COGS drivers)
focus_variants AS (
  SELECT variant_id, qty_sold, net_sales
  FROM by_variant
  ORDER BY qty_sold DESC
  LIMIT 150
),
variant_avg_rpc AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur_all_pi
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
    AND pi.sku_id IN (SELECT variant_id FROM focus_variants)
  GROUP BY pi.sku_id
),
variant_avg_org AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur_org_bills
  FROM public.purchase_items pi
  JOIN public.purchase_bills pb ON pb.id = pi.bill_id AND pb.deleted_at IS NULL
  CROSS JOIN params p
  WHERE pi.deleted_at IS NULL
    AND pb.organization_id = p.org_id
    AND pi.sku_id IN (SELECT variant_id FROM focus_variants)
  GROUP BY pi.sku_id
)
SELECT
  fv.variant_id,
  pr.product_name,
  pv.barcode,
  pv.size,
  pv.color,
  fv.qty_sold,
  ROUND(fv.net_sales, 2) AS net_sales,
  ROUND(
    fv.qty_sold * COALESCE(
      NULLIF(varpc.avg_pur_all_pi, 0),
      NULLIF(varorg.avg_pur_org_bills, 0),
      pv.pur_price,
      0
    ),
    2
  ) AS total_cogs,
  ROUND(
    fv.net_sales - fv.qty_sold * COALESCE(
      NULLIF(varpc.avg_pur_all_pi, 0),
      NULLIF(varorg.avg_pur_org_bills, 0),
      pv.pur_price,
      0
    ),
    2
  ) AS line_gp,
  ROUND(COALESCE(varpc.avg_pur_all_pi, 0)::numeric, 2) AS avg_pur_all_pi,
  ROUND(COALESCE(varorg.avg_pur_org_bills, 0)::numeric, 2) AS avg_pur_org_bills,
  ROUND(COALESCE(pv.pur_price, 0)::numeric, 2) AS variant_pur_price,
  ROUND(
    CASE
      WHEN COALESCE(pv.pur_price, 0) > 0
        THEN COALESCE(varpc.avg_pur_all_pi, 0) / pv.pur_price
      ELSE NULL
    END,
    2
  ) AS avg_to_variant_pur_ratio
FROM focus_variants fv
JOIN public.product_variants pv ON pv.id = fv.variant_id
CROSS JOIN params p
LEFT JOIN public.products pr ON pr.id = pv.product_id AND pr.organization_id = p.org_id
LEFT JOIN variant_avg_rpc varpc ON varpc.sku_id = fv.variant_id
LEFT JOIN variant_avg_org varorg ON varorg.sku_id = fv.variant_id
WHERE pv.organization_id = p.org_id
  AND COALESCE(pr.product_type, 'goods') <> 'service'
ORDER BY total_cogs DESC
LIMIT 40;
