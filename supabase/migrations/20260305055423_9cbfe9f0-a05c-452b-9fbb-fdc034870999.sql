CREATE OR REPLACE VIEW v_dashboard_gross_profit AS
SELECT 
  s.organization_id,
  date(s.sale_date) AS sale_day,
  COALESCE(SUM(s.net_amount), 0) AS total_sale_amount,
  COALESCE(SUM(sub.cost_amount), 0) AS total_cost_amount,
  (COALESCE(SUM(s.net_amount), 0) - COALESCE(SUM(sub.cost_amount), 0)) AS gross_profit,
  CASE 
    WHEN SUM(s.net_amount) = 0 THEN 0
    ELSE ((SUM(s.net_amount) - COALESCE(SUM(sub.cost_amount), 0)) / SUM(s.net_amount)) * 100
  END AS gross_margin_percent
FROM sales s
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(si.quantity::numeric * COALESCE(pv.pur_price, 0)), 0) AS cost_amount
  FROM sale_items si
  LEFT JOIN product_variants pv ON pv.id = si.variant_id
  WHERE si.sale_id = s.id AND si.deleted_at IS NULL
) sub ON true
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, date(s.sale_date);