
-- 1. Gross Profit View (COGS via product_variants.pur_price)
CREATE OR REPLACE VIEW v_dashboard_gross_profit WITH (security_invoker=on) AS
SELECT
  s.organization_id,
  DATE(s.sale_date) AS sale_day,
  COALESCE(SUM(si.quantity * si.unit_price), 0) AS total_sale_amount,
  COALESCE(SUM(si.quantity * COALESCE(pv.pur_price, 0)), 0) AS total_cost_amount,
  COALESCE(SUM(si.quantity * si.unit_price), 0) - COALESCE(SUM(si.quantity * COALESCE(pv.pur_price, 0)), 0) AS gross_profit,
  CASE
    WHEN SUM(si.quantity * si.unit_price) = 0 THEN 0
    ELSE ((SUM(si.quantity * si.unit_price) - SUM(si.quantity * COALESCE(pv.pur_price, 0)))
          / SUM(si.quantity * si.unit_price)) * 100
  END AS gross_margin_percent
FROM sales s
JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
LEFT JOIN product_variants pv ON pv.id = si.variant_id
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, DATE(s.sale_date);

-- 2. Purchase Summary View
CREATE OR REPLACE VIEW v_dashboard_purchase_summary WITH (security_invoker=on) AS
SELECT
  p.organization_id,
  DATE(p.bill_date) AS purchase_day,
  COUNT(DISTINCT p.id) AS bill_count,
  COALESCE(SUM(DISTINCT p.net_amount), 0) AS total_purchase_amount,
  COALESCE(SUM(DISTINCT p.paid_amount), 0) AS total_paid_amount,
  COALESCE(SUM(DISTINCT p.net_amount) - SUM(DISTINCT p.paid_amount), 0) AS total_pending_amount,
  COALESCE(SUM(pi.qty), 0) AS total_items_purchased
FROM purchase_bills p
LEFT JOIN purchase_items pi ON pi.bill_id = p.id AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id, DATE(p.bill_date);

-- 3. Enhanced Sales Summary View (add sold_qty)
CREATE OR REPLACE VIEW v_dashboard_sales_summary WITH (security_invoker=on) AS
SELECT
  s.organization_id,
  DATE(s.sale_date) AS sale_day,
  COUNT(DISTINCT s.id) AS invoice_count,
  COALESCE(SUM(DISTINCT s.net_amount), 0) AS total_sales,
  COALESCE(SUM(DISTINCT s.paid_amount), 0) AS total_paid,
  COALESCE(SUM(DISTINCT s.cash_amount), 0) AS total_cash,
  COALESCE(SUM(si.quantity), 0) AS sold_qty
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, DATE(s.sale_date);
