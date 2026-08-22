-- Fix Main Dashboard Total Purchase undercount.
--
-- Root cause: v_dashboard_purchase_summary LEFT JOINed purchase_items before aggregating,
-- then used sum(DISTINCT p.net_amount) to paper over the fan-out. DISTINCT collapses
-- same-day bills that share an identical net_amount (e.g. UK Fashion: ₹51,775 shown vs
-- ~₹66k stock value when multiple bills had matching totals).
--
-- Fix: pre-aggregate purchase_items qty per bill_id, then plain SUM on bill columns.
-- bill_date is already a calendar date (no IST bucketing needed).

CREATE OR REPLACE VIEW public.v_dashboard_purchase_summary AS
SELECT
  p.organization_id,
  p.bill_date AS purchase_day,
  COUNT(p.id)::bigint AS bill_count,
  COALESCE(SUM(p.net_amount), 0::numeric) AS total_purchase_amount,
  COALESCE(SUM(p.paid_amount), 0::numeric) AS total_paid_amount,
  COALESCE(SUM(p.net_amount), 0::numeric) - COALESCE(SUM(p.paid_amount), 0::numeric) AS total_pending_amount,
  COALESCE(SUM(qty.purchase_qty), 0::numeric) AS total_items_purchased
FROM public.purchase_bills p
LEFT JOIN (
  SELECT
    pi.bill_id,
    SUM(pi.qty) AS purchase_qty
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
  GROUP BY pi.bill_id
) qty ON qty.bill_id = p.id
WHERE p.deleted_at IS NULL
  AND COALESCE(p.is_cancelled, false) = false
GROUP BY p.organization_id, p.bill_date;

ALTER VIEW public.v_dashboard_purchase_summary SET (security_invoker = true);

COMMENT ON VIEW public.v_dashboard_purchase_summary IS
  'Per-org day purchase rollup for Main Dashboard. Qty joined pre-aggregated per bill; money columns use plain SUM (not DISTINCT).';
