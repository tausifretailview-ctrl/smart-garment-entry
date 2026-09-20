-- Phase 2 — Zero / low-net sale lines with positive COGS (drill-down)
-- Run ONE block at a time (Ctrl+A in a single block). Set org + dates in params.
--
-- Use after top-variants export shows net_sales ≈ 0 but total_cogs > 0.
-- Ella examples: AM-A02 (0266df53-…), IQA-A01 (086c8944-…)
-- KS examples: PUL82 / 0040009670 (e7f634f8-…)
--
-- net_line_simple = COALESCE(net_after_discount, line_total) — matches stored column when NAD is 0.
-- net_line_economic = NULLIF(NAD,0) else line_total — flags invoice lines with NAD=0 but line_total>0.
-- Org KPI (get_net_profit_kpis) uses full header allocation; neither column equals RPC line net exactly.

-- =============================================================================
-- A) Summary — how many lines are zero-net with COGS in period
-- =============================================================================
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,  -- Ella Noor
    '2026-09-01'::date AS d_from,
    '2026-09-30'::date AS d_to,
    0.01::numeric AS net_tolerance  -- treat |net| <= this as "zero net"
),
bounds AS (
  SELECT
    (d_from::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    (d_to::text || 'T23:59:59.999+05:30')::timestamptz AS v_to,
    org_id,
    net_tolerance
  FROM params
),
period_sales AS (
  SELECT
    s.id,
    s.sale_number,
    s.sale_date,
    s.sale_type,
    s.payment_method,
    s.payment_status,
    COALESCE(s.gross_amount, 0)::numeric AS gross_amount,
    COALESCE(s.discount_amount, 0)::numeric AS discount_amount,
    COALESCE(s.flat_discount_amount, 0)::numeric AS flat_discount_amount,
    COALESCE(s.points_redeemed_amount, 0)::numeric AS points_redeemed_amount,
    COALESCE(s.net_amount, 0)::numeric AS net_amount
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
line_base AS (
  SELECT
    ps.sale_number,
    ps.sale_date,
    ps.sale_type,
    ps.payment_method,
    ps.payment_status,
    ps.gross_amount AS header_gross,
    ps.discount_amount AS header_item_disc,
    ps.flat_discount_amount AS header_flat,
    ps.points_redeemed_amount AS header_points,
    ps.net_amount AS header_net_amount,
    si.id AS sale_item_id,
    si.variant_id,
    si.product_id,
    si.product_name,
    COALESCE(si.quantity, 0)::numeric AS quantity,
    COALESCE(si.line_total, 0)::numeric AS line_total,
    COALESCE(si.unit_price, 0)::numeric AS unit_price,
    COALESCE(si.mrp, 0)::numeric AS mrp,
    si.net_after_discount,
    si.discount_share,
    si.round_off_share
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN params p
  WHERE si.deleted_at IS NULL
    AND si.organization_id = p.org_id
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
),
line_net AS (
  SELECT
    lb.*,
    COALESCE(lb.net_after_discount::numeric, lb.line_total, 0)::numeric AS net_line_simple,
    COALESCE(
      NULLIF(lb.net_after_discount::numeric, 0),
      NULLIF(lb.line_total, 0),
      0
    )::numeric AS net_line_economic
  FROM line_base lb
),
sold_variants AS (
  SELECT DISTINCT variant_id FROM line_net WHERE variant_id IS NOT NULL
),
variant_avg AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
    AND pi.sku_id IN (SELECT variant_id FROM sold_variants)
  GROUP BY pi.sku_id
),
line_cogs AS (
  SELECT
    ln.*,
    pv.barcode,
    pv.pur_price AS variant_pur_price,
    CASE
      WHEN COALESCE(pr.product_type, 'goods') = 'service' OR ln.variant_id IS NULL THEN 0::numeric
      ELSE ln.quantity * COALESCE(NULLIF(va.avg_pur, 0), pv.pur_price, 0)::numeric
    END AS cogs
  FROM line_net ln
  CROSS JOIN params p
  LEFT JOIN public.product_variants pv ON pv.id = ln.variant_id AND pv.organization_id = p.org_id
  LEFT JOIN public.products pr ON pr.id = COALESCE(ln.product_id, pv.product_id) AND pr.organization_id = p.org_id
  LEFT JOIN variant_avg va ON va.sku_id = ln.variant_id
)
SELECT
  o.name AS org_name,
  p.d_from,
  p.d_to,
  COUNT(*)::int AS sale_line_count,
  COUNT(*) FILTER (
    WHERE ABS(lc.net_line_simple) <= p.net_tolerance AND lc.cogs > 0
  )::int AS zero_net_simple_positive_cogs_lines,
  COUNT(*) FILTER (
    WHERE ABS(lc.net_line_economic) <= p.net_tolerance AND lc.cogs > 0
  )::int AS zero_net_economic_positive_cogs_lines,
  COUNT(*) FILTER (
    WHERE COALESCE(lc.net_after_discount::numeric, 0) = 0
      AND lc.line_total > p.net_tolerance
      AND lc.cogs > 0
  )::int AS nad_zero_line_total_positive_cogs_lines,
  ROUND(COALESCE(SUM(lc.cogs) FILTER (
    WHERE ABS(lc.net_line_simple) <= p.net_tolerance
  ), 0)::numeric, 2) AS cogs_on_zero_net_simple_lines,
  ROUND(COALESCE(SUM(lc.cogs) FILTER (
    WHERE COALESCE(lc.net_after_discount::numeric, 0) = 0 AND lc.line_total > p.net_tolerance
  ), 0)::numeric, 2) AS cogs_on_nad_zero_line_total_pos_lines,
  ROUND(COALESCE(SUM(lc.net_line_simple), 0)::numeric, 2) AS sum_net_simple_all_lines,
  ROUND(COALESCE(SUM(lc.net_line_economic), 0)::numeric, 2) AS sum_net_economic_all_lines,
  ROUND(COALESCE(SUM(lc.cogs), 0)::numeric, 2) AS sum_cogs_all_lines
FROM line_cogs lc
CROSS JOIN params p
JOIN public.organizations o ON o.id = p.org_id
GROUP BY o.name, p.d_from, p.d_to;

-- =============================================================================
-- B) Line listing — zero / low net with COGS > 0 (newest sales first)
-- =============================================================================
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    '2026-09-01'::date AS d_from,
    '2026-09-30'::date AS d_to,
    0.01::numeric AS net_tolerance,
    NULL::uuid AS filter_variant_id  -- e.g. '0266df53-2daf-4779-85fa-f9cb5916a32f'::uuid
),
bounds AS (
  SELECT
    (d_from::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    (d_to::text || 'T23:59:59.999+05:30')::timestamptz AS v_to,
    org_id,
    net_tolerance,
    filter_variant_id
  FROM params
),
period_sales AS (
  SELECT
    s.id,
    s.sale_number,
    s.sale_date,
    s.sale_type,
    s.payment_method,
    s.payment_status,
    COALESCE(s.gross_amount, 0)::numeric AS gross_amount,
    COALESCE(s.discount_amount, 0)::numeric AS discount_amount,
    COALESCE(s.flat_discount_amount, 0)::numeric AS flat_discount_amount,
    COALESCE(s.points_redeemed_amount, 0)::numeric AS points_redeemed_amount
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
line_base AS (
  SELECT
    ps.sale_number,
    ps.sale_date,
    ps.sale_type,
    ps.payment_method,
    ps.payment_status,
    ps.gross_amount AS header_gross,
    ps.discount_amount AS header_item_disc,
    ps.flat_discount_amount AS header_flat,
    ps.points_redeemed_amount AS header_points,
    si.variant_id,
    si.product_name,
    COALESCE(si.quantity, 0)::numeric AS quantity,
    COALESCE(si.line_total, 0)::numeric AS line_total,
    COALESCE(si.unit_price, 0)::numeric AS unit_price,
    si.net_after_discount,
    si.discount_share,
    si.round_off_share
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN bounds b
  WHERE si.deleted_at IS NULL
    AND si.organization_id = b.org_id
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
    AND (b.filter_variant_id IS NULL OR si.variant_id = b.filter_variant_id)
),
line_net AS (
  SELECT
    lb.*,
    COALESCE(lb.net_after_discount::numeric, lb.line_total, 0)::numeric AS net_line_simple,
    COALESCE(
      NULLIF(lb.net_after_discount::numeric, 0),
      NULLIF(lb.line_total, 0),
      0
    )::numeric AS net_line_economic
  FROM line_base lb
),
sold_variants AS (
  SELECT DISTINCT variant_id FROM line_net WHERE variant_id IS NOT NULL
),
variant_avg AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
    AND pi.sku_id IN (SELECT variant_id FROM sold_variants)
  GROUP BY pi.sku_id
),
line_cogs AS (
  SELECT
    ln.*,
    pv.barcode,
    CASE
      WHEN COALESCE(pr.product_type, 'goods') = 'service' OR ln.variant_id IS NULL THEN 0::numeric
      ELSE ln.quantity * COALESCE(NULLIF(va.avg_pur, 0), pv.pur_price, 0)::numeric
    END AS cogs
  FROM line_net ln
  CROSS JOIN params p
  LEFT JOIN public.product_variants pv ON pv.id = ln.variant_id AND pv.organization_id = p.org_id
  LEFT JOIN public.products pr ON pr.id = pv.product_id AND pr.organization_id = p.org_id
  LEFT JOIN variant_avg va ON va.sku_id = ln.variant_id
)
SELECT
  o.name AS org_name,
  lc.sale_number,
  lc.sale_date,
  lc.sale_type,
  lc.payment_method,
  lc.payment_status,
  lc.barcode,
  lc.product_name,
  lc.variant_id,
  lc.quantity,
  lc.line_total,
  lc.net_after_discount,
  lc.net_line_simple,
  lc.net_line_economic,
  lc.discount_share,
  lc.round_off_share,
  lc.header_gross,
  lc.header_item_disc,
  lc.header_flat,
  lc.header_points,
  ROUND(lc.cogs, 2) AS cogs,
  ROUND(lc.net_line_simple - lc.cogs, 2) AS line_gp_simple,
  ROUND(lc.net_line_economic - lc.cogs, 2) AS line_gp_economic
FROM line_cogs lc
CROSS JOIN params p
JOIN public.organizations o ON o.id = p.org_id
WHERE (
    (ABS(lc.net_line_simple) <= p.net_tolerance AND lc.cogs > 0)
    OR (
      COALESCE(lc.net_after_discount::numeric, 0) = 0
      AND lc.line_total > p.net_tolerance
      AND lc.cogs > 0
    )
  )
ORDER BY lc.cogs DESC, lc.sale_date DESC
LIMIT 100;
