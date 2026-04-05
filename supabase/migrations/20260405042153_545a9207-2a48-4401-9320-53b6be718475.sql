
DROP VIEW IF EXISTS public.v_dashboard_stock_summary CASCADE;

CREATE OR REPLACE VIEW public.v_dashboard_stock_summary
WITH (security_invoker = true) AS
SELECT
  pv.organization_id,
  COALESCE(SUM(pv.stock_qty), 0)::bigint AS total_stock_qty,
  COALESCE(SUM(pv.stock_qty::numeric * COALESCE(pv.pur_price, 0)), 0)::numeric AS total_stock_value,
  COALESCE(SUM(pv.stock_qty::numeric * COALESCE(pv.sale_price, 0)), 0)::numeric AS total_sale_value,
  COUNT(*)::int AS total_variant_count
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL
  AND p.deleted_at IS NULL
  AND pv.active = true
  AND p.product_type != 'service'
GROUP BY pv.organization_id;

CREATE OR REPLACE FUNCTION public.get_stock_report_totals(p_organization_id UUID)
RETURNS JSON
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'total_stock',   COALESCE(SUM(pv.stock_qty), 0)::int,
    'stock_value',   COALESCE(SUM(COALESCE(pv.pur_price, 0) * pv.stock_qty), 0),
    'sale_value',    COALESCE(SUM(pv.sale_price * pv.stock_qty), 0),
    'variant_count', COUNT(*)::int
  )
  FROM product_variants pv
  INNER JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND pv.active = true
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.product_type != 'service';
$$;
