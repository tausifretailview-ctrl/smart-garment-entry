-- Fix: Dashboard Stock Qty & Value mismatch with Stock Report
-- Root cause: v_dashboard_stock_summary missing active and service filters

DROP VIEW IF EXISTS public.v_dashboard_stock_summary CASCADE;

CREATE OR REPLACE VIEW public.v_dashboard_stock_summary
WITH (security_invoker = true) AS
SELECT
  pv.organization_id,
  COALESCE(SUM(pv.current_stock), 0)::bigint AS total_stock_qty,
  COALESCE(SUM(pv.current_stock::numeric * COALESCE(pv.pur_price, 0)), 0)::numeric AS total_stock_value,
  COALESCE(SUM(pv.current_stock::numeric * COALESCE(pv.sale_price, 0)), 0)::numeric AS total_sale_value,
  COUNT(*)::int AS total_variant_count
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND pv.active = true
  AND p.product_type != 'service'
GROUP BY pv.organization_id;