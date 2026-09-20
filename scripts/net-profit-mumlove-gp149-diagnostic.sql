-- MUMLOVE: Gross Profit nonzero with zero sales — run ONE block at a time in SQL editor.
-- Period: September 2026 (dashboard "Monthly - September 2026").

-- =============================================================================
-- 1) Raw KPI RPC (dashboard Gross Profit card on main uses this)
-- =============================================================================
SELECT public.get_net_profit_kpis(
  (SELECT id FROM public.organizations WHERE slug = 'mumlove' LIMIT 1),
  '2026-09-01'::date,
  '2026-09-30'::date
);

-- =============================================================================
-- 2) Stored-net dashboard RPC (Total Sales / Invoices / Sold Qty)
-- =============================================================================
SELECT public.get_erp_dashboard_stats(
  (SELECT id FROM public.organizations WHERE slug = 'mumlove' LIMIT 1),
  '2026-09-01'::date,
  '2026-09-30'::date
);

-- =============================================================================
-- 3) Live sales in IST window (same filters as get_net_profit_kpis)
-- =============================================================================
WITH b AS (
  SELECT
    (SELECT id FROM public.organizations WHERE slug = 'mumlove' LIMIT 1) AS org_id,
    ('2026-09-01'::text || 'T00:00:00.000+05:30')::timestamptz AS v_from,
    ('2026-09-30'::text || 'T23:59:59.999+05:30')::timestamptz AS v_to
)
SELECT
  COUNT(*) AS n_sales,
  COALESCE(SUM(s.net_amount), 0) AS sum_header_net,
  COALESCE(SUM(si.quantity), 0) AS sum_line_qty
FROM public.sales s
CROSS JOIN b
LEFT JOIN public.sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
WHERE s.organization_id = b.org_id
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
  AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
  AND s.sale_date >= b.v_from
  AND s.sale_date <= b.v_to;

-- =============================================================================
-- 4) Orphan sale_items (parent deleted/missing)
-- =============================================================================
SELECT COUNT(*) AS orphan_items,
       COALESCE(SUM(si.quantity), 0) AS orphan_qty
FROM public.sale_items si
LEFT JOIN public.sales s ON s.id = si.sale_id
WHERE si.organization_id = (SELECT id FROM public.organizations WHERE slug = 'mumlove' LIMIT 1)
  AND si.deleted_at IS NULL
  AND (s.id IS NULL OR s.deleted_at IS NOT NULL);

-- =============================================================================
-- 5) Deleted purchase bills still counted in COGS avg (RPC/NPA shared gap)
-- =============================================================================
SELECT COUNT(*) AS lines_on_deleted_bills,
       COALESCE(SUM(pi.qty), 0) AS qty
FROM public.purchase_items pi
JOIN public.purchase_bills pb ON pb.id = pi.bill_id
WHERE pb.organization_id = (SELECT id FROM public.organizations WHERE slug = 'mumlove' LIMIT 1)
  AND pi.deleted_at IS NULL
  AND pb.deleted_at IS NOT NULL;
