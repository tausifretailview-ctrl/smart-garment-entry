-- Fix Main Dashboard Total Sales undercount.
--
-- Root cause: v_dashboard_sales_summary LEFT JOINed sale_items before aggregating,
-- then used sum(DISTINCT s.net_amount) to paper over the fan-out. DISTINCT collapses
-- same-day invoices that share an identical net_amount (the ₹14k+ class of gaps).
--
-- Fix: pre-aggregate sale_items qty per sale_id, then plain SUM on sales columns.
-- Keep Asia/Kolkata sale_day bucketing (do NOT use date(sale_date) / UTC).

CREATE OR REPLACE VIEW public.v_dashboard_sales_summary AS
SELECT
  s.organization_id,
  (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day,
  COUNT(s.id)::bigint AS invoice_count,
  COALESCE(SUM(s.net_amount), 0::numeric) AS total_sales,
  COALESCE(SUM(s.paid_amount), 0::numeric) AS total_paid,
  COALESCE(SUM(s.cash_amount), 0::numeric) AS total_cash,
  COALESCE(SUM(qty.sold_qty), 0::numeric) AS sold_qty
FROM public.sales s
LEFT JOIN (
  SELECT
    si.sale_id,
    SUM(si.quantity) AS sold_qty
  FROM public.sale_items si
  WHERE si.deleted_at IS NULL
  GROUP BY si.sale_id
) qty ON qty.sale_id = s.id
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
GROUP BY s.organization_id, (timezone('Asia/Kolkata', s.sale_date))::date;

ALTER VIEW public.v_dashboard_sales_summary SET (security_invoker = true);

COMMENT ON VIEW public.v_dashboard_sales_summary IS
  'Per-org IST day sales rollup for Main Dashboard. Qty joined pre-aggregated per sale; money columns use plain SUM (not DISTINCT).';
