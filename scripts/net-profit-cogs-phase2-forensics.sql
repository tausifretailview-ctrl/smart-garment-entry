-- Phase 2 — Net Profit / Gross Profit COGS forensics (Ella Noor + KS Footwear)
-- Run in Supabase SQL Editor (postgres). One org per run: set org_id / dates in params CTE.
--
-- Phase 1 recap (Sept 2026, live RPC, IST bounds applied):
--   Ella Noor  3fdca631-1e0c-4417-9704-421f5129ff67  net 1854300  COGS 2200274  GP -345974  inv 292
--   KS Footwear 4bc73037-e877-4123-9261-eb6e3876698c  net 134963   COGS 1149138  GP -1014175 inv 434
--
-- COGS engine (RPC + NPA): qty * qty-weighted avg(purchase_items.pur_price) per variant_id,
-- fallback product_variants.pur_price. purchase_items has no organization_id — only sku_id.

-- =============================================================================
-- 0) Quick KPI (should match get_net_profit_kpis JSON)
-- =============================================================================
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,  -- swap for KS org
    '2026-09-01'::date AS d_from,
    '2026-09-30'::date AS d_to
),
bounds AS (
  SELECT
    (d_from::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    (d_to::text || 'T23:59:59.999+05:30')::timestamptz AS v_to,
    org_id
  FROM params
)
SELECT public.get_net_profit_kpis(
  (SELECT org_id FROM bounds),
  (SELECT d_from FROM params),
  (SELECT d_to FROM params)
);

-- =============================================================================
-- 1) Top variants by period COGS (where the pain is)
-- =============================================================================
WITH params AS (
  SELECT
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id,
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
  FROM public.sales s, bounds b
  WHERE s.organization_id = b.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
    AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
    AND s.sale_date >= b.v_from
    AND s.sale_date <= b.v_to
),
sale_lines AS (
  SELECT
    si.variant_id,
    si.product_id,
    COALESCE(si.quantity, 0)::numeric AS quantity,
    COALESCE(si.line_total, 0)::numeric AS line_total,
    COALESCE(si.unit_price, 0)::numeric AS unit_price,
    COALESCE(si.mrp, 0)::numeric AS mrp,
    si.discount_share,
    si.round_off_share,
    si.net_after_discount,
    si.sale_id
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN params p
  WHERE si.deleted_at IS NULL
    AND si.organization_id = p.org_id
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
),
line_grossed AS (
  SELECT
    sl.*,
    CASE
      WHEN (sl.quantity * CASE WHEN sl.mrp > 0 THEN sl.mrp ELSE sl.unit_price END) > 0
        THEN sl.quantity * CASE WHEN sl.mrp > 0 THEN sl.mrp ELSE sl.unit_price END
      WHEN sl.line_total <> 0 THEN sl.line_total
      ELSE 0
    END AS line_gross
  FROM sale_lines sl
),
-- Simplified net line (matches RPC when net_after_discount populated)
line_netted AS (
  SELECT
    lg.variant_id,
    lg.product_id,
    lg.quantity,
    lg.line_total,
    lg.unit_price,
    COALESCE(lg.net_after_discount::numeric, lg.line_total) AS net_line
  FROM line_grossed lg
),
variant_avg_rpc AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur_all_bills
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
    AND pi.sku_id IN (SELECT DISTINCT variant_id FROM sale_lines WHERE variant_id IS NOT NULL)
  GROUP BY pi.sku_id
),
variant_avg_org_bills AS (
  SELECT
    pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur_org_bills_only
  FROM public.purchase_items pi
  JOIN public.purchase_bills pb ON pb.id = pi.bill_id AND pb.deleted_at IS NULL
  CROSS JOIN params p
  WHERE pi.deleted_at IS NULL
    AND pb.organization_id = p.org_id
    AND pi.sku_id IN (SELECT DISTINCT variant_id FROM sale_lines WHERE variant_id IS NOT NULL)
  GROUP BY pi.sku_id
),
line_cogs AS (
  SELECT
    ln.variant_id,
    ln.quantity,
    ln.net_line,
    ln.unit_price,
    CASE
      WHEN COALESCE(pr.product_type, 'goods') = 'service' OR ln.variant_id IS NULL THEN 0
      ELSE ln.quantity * COALESCE(
        NULLIF(va.avg_pur_all_bills, 0),
        NULLIF(vao.avg_pur_org_bills_only, 0),
        pv.pur_price,
        0
      )
    END AS cogs,
    COALESCE(va.avg_pur_all_bills, 0) AS avg_pur_rpc,
    COALESCE(vao.avg_pur_org_bills_only, 0) AS avg_pur_org,
    COALESCE(pv.pur_price, 0) AS variant_pur_price
  FROM line_netted ln
  LEFT JOIN public.product_variants pv ON pv.id = ln.variant_id
  LEFT JOIN public.products pr ON pr.id = COALESCE(ln.product_id, pv.product_id)
  LEFT JOIN variant_avg_rpc va ON va.sku_id = ln.variant_id
  LEFT JOIN variant_avg_org_bills vao ON vao.sku_id = ln.variant_id
  CROSS JOIN params p
  WHERE pv.organization_id = p.org_id OR ln.variant_id IS NULL
)
SELECT
  lc.variant_id,
  pr.product_name,
  pv.barcode,
  pv.size,
  pv.color,
  SUM(lc.quantity) AS qty_sold,
  ROUND(SUM(lc.net_line)::numeric, 2) AS net_sales,
  ROUND(SUM(lc.cogs)::numeric, 2) AS total_cogs,
  ROUND(SUM(lc.net_line - lc.cogs)::numeric, 2) AS line_gp,
  ROUND(MAX(lc.avg_pur_rpc)::numeric, 2) AS avg_pur_from_all_pi,
  ROUND(MAX(lc.avg_pur_org)::numeric, 2) AS avg_pur_org_bills_only,
  ROUND(MAX(lc.variant_pur_price)::numeric, 2) AS variant_pur_price,
  ROUND(MAX(lc.unit_price)::numeric, 2) AS sample_unit_price,
  COUNT(*) AS line_count
FROM line_cogs lc
LEFT JOIN public.product_variants pv ON pv.id = lc.variant_id
LEFT JOIN public.products pr ON pr.id = pv.product_id
WHERE lc.variant_id IS NOT NULL
GROUP BY lc.variant_id, pr.product_name, pv.barcode, pv.size, pv.color
ORDER BY SUM(lc.cogs) DESC
LIMIT 40;

-- =============================================================================
-- 2) RPC vs org-scoped purchase average — drift alarm
--    If avg_pur_all_pi >> avg_pur_org_bills_only, wrong-org bills may be on the SKU.
-- =============================================================================
WITH params AS (
  SELECT '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id
),
sold_variants AS (
  SELECT DISTINCT si.variant_id
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND si.organization_id = p.org_id
    AND s.deleted_at IS NULL AND si.deleted_at IS NULL
    AND s.sale_date >= '2026-09-01T00:00:00.000+05:30'::timestamptz
    AND s.sale_date <= '2026-09-30T23:59:59.999+05:30'::timestamptz
    AND si.variant_id IS NOT NULL
),
avg_all AS (
  SELECT pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_all
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL AND pi.sku_id IN (SELECT variant_id FROM sold_variants)
  GROUP BY pi.sku_id
),
avg_org AS (
  SELECT pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_org
  FROM public.purchase_items pi
  JOIN public.purchase_bills pb ON pb.id = pi.bill_id AND pb.deleted_at IS NULL
  CROSS JOIN params p
  WHERE pi.deleted_at IS NULL
    AND pb.organization_id = p.org_id
    AND pi.sku_id IN (SELECT variant_id FROM sold_variants)
  GROUP BY pi.sku_id
)
SELECT
  sv.variant_id,
  pr.product_name,
  pv.barcode,
  ROUND(a.avg_all::numeric, 2) AS avg_pur_all_pi_rows,
  ROUND(o.avg_org::numeric, 2) AS avg_pur_org_bills_only,
  ROUND((a.avg_all - COALESCE(o.avg_org, 0))::numeric, 2) AS avg_drift,
  ROUND(pv.pur_price::numeric, 2) AS variant_pur_price
FROM sold_variants sv
JOIN avg_all a ON a.sku_id = sv.variant_id
LEFT JOIN avg_org o ON o.sku_id = sv.variant_id
JOIN public.product_variants pv ON pv.id = sv.variant_id
LEFT JOIN public.products pr ON pr.id = pv.product_id
CROSS JOIN params p
WHERE pv.organization_id = p.org_id
  AND (
    a.avg_all > COALESCE(o.avg_org, 0) * 1.05
    OR a.avg_all > COALESCE(pv.pur_price, 0) * 2
  )
ORDER BY (a.avg_all - COALESCE(o.avg_org, 0)) DESC NULLS LAST
LIMIT 50;

-- =============================================================================
-- 3) Duplicate purchase lines (same bill + sku + price + qty) — inflates weighted avg
-- =============================================================================
WITH params AS (
  SELECT '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id
)
SELECT
  pb.bill_number,
  pb.bill_date,
  pi.sku_id,
  pr.product_name,
  pv.barcode,
  pi.pur_price,
  pi.qty,
  COUNT(*) AS duplicate_row_count,
  SUM(COALESCE(pi.qty, 1)) AS total_qty_rows
FROM public.purchase_items pi
JOIN public.purchase_bills pb ON pb.id = pi.bill_id AND pb.deleted_at IS NULL
JOIN public.product_variants pv ON pv.id = pi.sku_id
LEFT JOIN public.products pr ON pr.id = pv.product_id
CROSS JOIN params p
WHERE pi.deleted_at IS NULL
  AND pb.organization_id = p.org_id
  AND pi.sku_id IN (
    SELECT DISTINCT si.variant_id
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p.org_id
      AND s.sale_date >= '2026-09-01T00:00:00.000+05:30'::timestamptz
      AND s.sale_date <= '2026-09-30T23:59:59.999+05:30'::timestamptz
      AND s.deleted_at IS NULL AND si.deleted_at IS NULL
  )
GROUP BY pb.bill_number, pb.bill_date, pi.sku_id, pr.product_name, pv.barcode, pi.pur_price, pi.qty
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, pb.bill_date DESC
LIMIT 50;

-- =============================================================================
-- 4) Purchase rows on SKU where bill org ≠ variant org (should be 0)
-- =============================================================================
SELECT COUNT(*) AS mismatched_pi_rows
FROM public.purchase_items pi
JOIN public.purchase_bills pb ON pb.id = pi.bill_id AND pb.deleted_at IS NULL
JOIN public.product_variants pv ON pv.id = pi.sku_id AND pv.deleted_at IS NULL
WHERE pi.deleted_at IS NULL
  AND pb.organization_id <> pv.organization_id;

-- =============================================================================
-- 5) Period summary — qty, zero-cost COGS, lines where COGS > net (loss makers)
--
-- IMPORTANT (Supabase SQL editor):
--   Select from the line "WITH params AS" below through "FROM line_cogs;"
--   Do NOT run only "line_cogs AS (...)" — that causes syntax/server errors.
--   If you get "Server error", run §5-lite first, then §1 (top variants) only.
-- =============================================================================

-- §5-lite — KPI + line counts only (fast; no purchase_items scan)
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    '2026-09-01'::date AS d_from,
    '2026-09-30'::date AS d_to
),
bounds AS (
  SELECT
    (d_from::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    (d_to::text || 'T23:59:59.999+05:30')::timestamptz AS v_to,
    org_id
  FROM params
)
SELECT
  p.org_id,
  (SELECT COUNT(*)::int FROM public.sales s, bounds b
   WHERE s.organization_id = b.org_id
     AND s.deleted_at IS NULL
     AND COALESCE(s.is_cancelled, false) = false
     AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
     AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
     AND s.sale_date >= b.v_from AND s.sale_date <= b.v_to) AS invoice_count,
  (SELECT COUNT(*)::int
   FROM public.sale_items si
   JOIN public.sales s ON s.id = si.sale_id
   CROSS JOIN bounds b
   WHERE s.organization_id = b.org_id AND si.organization_id = b.org_id
     AND s.deleted_at IS NULL AND si.deleted_at IS NULL
     AND s.sale_date >= b.v_from AND s.sale_date <= b.v_to
     AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)) AS sale_line_count,
  public.get_net_profit_kpis(p.org_id, p.d_from, p.d_to) AS kpis
FROM params p;

-- §5-full — line-level COGS rollup (same avg logic as RPC; can timeout on large orgs)
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
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
  SELECT s.id FROM public.sales s, bounds b
  WHERE s.organization_id = b.org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
    AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
    AND s.sale_date >= b.v_from AND s.sale_date <= b.v_to
),
sold_variants AS (
  SELECT DISTINCT si.variant_id
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN params p
  WHERE si.deleted_at IS NULL AND si.organization_id = p.org_id
    AND si.variant_id IS NOT NULL
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
),
sale_lines AS (
  SELECT si.variant_id, si.product_id,
    COALESCE(si.quantity, 0)::numeric AS quantity,
    COALESCE(si.net_after_discount::numeric, si.line_total, 0)::numeric AS net_line
  FROM public.sale_items si
  JOIN period_sales ps ON ps.id = si.sale_id
  CROSS JOIN params p
  WHERE si.deleted_at IS NULL AND si.organization_id = p.org_id
    AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
),
-- RPC uses all purchase_items for sku_id; optional org-scoped avg for comparison:
variant_avg AS (
  SELECT pi.sku_id,
    SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
      / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
    AND pi.sku_id IN (SELECT variant_id FROM sold_variants)
  GROUP BY pi.sku_id
),
line_cogs AS (
  SELECT
    sl.quantity,
    sl.net_line,
    CASE
      WHEN COALESCE(pr.product_type, 'goods') = 'service' OR sl.variant_id IS NULL THEN 0::numeric
      ELSE sl.quantity * COALESCE(NULLIF(va.avg_pur, 0), pv.pur_price, 0)::numeric
    END AS cogs
  FROM sale_lines sl
  CROSS JOIN params p
  LEFT JOIN public.product_variants pv
    ON pv.id = sl.variant_id AND pv.organization_id = p.org_id
  LEFT JOIN public.products pr
    ON pr.id = COALESCE(sl.product_id, pv.product_id) AND pr.organization_id = p.org_id
  LEFT JOIN variant_avg va ON va.sku_id = sl.variant_id
)
SELECT
  ROUND(SUM(net_line)::numeric, 2) AS sum_net_sales_lines,
  ROUND(SUM(cogs)::numeric, 2) AS sum_cogs,
  ROUND(SUM(net_line - cogs)::numeric, 2) AS sum_line_gp,
  SUM(quantity) AS total_qty,
  SUM(CASE WHEN cogs = 0 AND quantity > 0 THEN quantity ELSE 0 END) AS zero_cost_qty,
  COUNT(*) FILTER (WHERE cogs > net_line AND net_line >= 0) AS lines_cogs_gt_net,
  ROUND(COALESCE(SUM(cogs) FILTER (WHERE cogs > net_line), 0)::numeric, 2) AS cogs_on_loss_lines
FROM line_cogs;
