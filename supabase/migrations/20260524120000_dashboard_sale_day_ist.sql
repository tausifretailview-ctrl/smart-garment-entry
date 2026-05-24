-- Use IST calendar day for dashboard sales/profit summaries.
-- Fixes night POS bills (e.g. 12:59 AM IST) missing from "today" stats when grouped by UTC date.

CREATE OR REPLACE VIEW public.v_dashboard_sales_summary AS
SELECT s.organization_id,
       (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day,
       count(DISTINCT s.id) AS invoice_count,
       COALESCE(sum(DISTINCT s.net_amount), 0::numeric) AS total_sales,
       COALESCE(sum(DISTINCT s.paid_amount), 0::numeric) AS total_paid,
       COALESCE(sum(DISTINCT s.cash_amount), 0::numeric) AS total_cash,
       COALESCE(sum(si.quantity), 0::numeric) AS sold_qty
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
GROUP BY s.organization_id, (timezone('Asia/Kolkata', s.sale_date))::date;

CREATE OR REPLACE VIEW public.v_dashboard_gross_profit AS
SELECT s.organization_id,
       (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day,
       COALESCE(sum(s.net_amount), 0::numeric) AS total_sale_amount,
       COALESCE(sum(sub.cost_amount), 0::numeric) AS total_cost_amount,
       COALESCE(sum(s.net_amount), 0::numeric) - COALESCE(sum(sub.cost_amount), 0::numeric) AS gross_profit,
       CASE WHEN sum(s.net_amount) = 0::numeric THEN 0::numeric
            ELSE (sum(s.net_amount) - COALESCE(sum(sub.cost_amount), 0::numeric)) / sum(s.net_amount) * 100::numeric
       END AS gross_margin_percent
FROM sales s
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(si.quantity * COALESCE(pv.pur_price, 0::numeric)), 0::numeric) AS cost_amount
  FROM sale_items si
  LEFT JOIN product_variants pv ON pv.id = si.variant_id
  WHERE si.sale_id = s.id AND si.deleted_at IS NULL
) sub ON true
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
GROUP BY s.organization_id, (timezone('Asia/Kolkata', s.sale_date))::date;

ALTER VIEW public.v_dashboard_sales_summary SET (security_invoker = true);
ALTER VIEW public.v_dashboard_gross_profit SET (security_invoker = true);
