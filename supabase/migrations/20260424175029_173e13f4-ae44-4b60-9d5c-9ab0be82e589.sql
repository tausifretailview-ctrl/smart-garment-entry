-- Exclude cancelled purchase bills from dashboard purchase summary view
CREATE OR REPLACE VIEW public.v_dashboard_purchase_summary AS
SELECT
  p.organization_id,
  p.bill_date AS purchase_day,
  count(DISTINCT p.id) AS bill_count,
  COALESCE(sum(DISTINCT p.net_amount), 0::numeric) AS total_purchase_amount,
  COALESCE(sum(DISTINCT p.paid_amount), 0::numeric) AS total_paid_amount,
  COALESCE(sum(DISTINCT p.net_amount) - sum(DISTINCT p.paid_amount), 0::numeric) AS total_pending_amount,
  COALESCE(sum(pi.qty), 0::numeric) AS total_items_purchased
FROM purchase_bills p
LEFT JOIN purchase_items pi ON pi.bill_id = p.id AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
  AND COALESCE(p.is_cancelled, false) = false
GROUP BY p.organization_id, p.bill_date;