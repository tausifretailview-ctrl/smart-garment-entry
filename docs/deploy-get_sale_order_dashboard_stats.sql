-- =============================================================================
-- Deploy: Sale Order Dashboard KPI stats RPC
-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Fixes console 404 / KPI cards stuck at 0 on Sale Order Dashboard
-- Source: supabase/migrations/20260911200000_get_sale_order_dashboard_stats.sql
-- =============================================================================

-- Sale Order Dashboard KPI tiles: one org-scoped aggregate row (no full order/item scans to the client).

CREATE OR REPLACE FUNCTION public.get_sale_order_dashboard_stats(p_organization_id uuid)
RETURNS TABLE(
  total bigint,
  total_value numeric,
  pending bigint,
  partial bigint,
  confirmed bigint,
  pending_items numeric,
  pending_value numeric,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH orders AS (
    SELECT id, status, net_amount
    FROM public.sale_orders
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
  ),
  order_stats AS (
    SELECT
      COUNT(*)::bigint AS total,
      COALESCE(SUM(net_amount), 0)::numeric AS total_value,
      COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
      COUNT(*) FILTER (WHERE status = 'partial')::bigint AS partial,
      COUNT(*) FILTER (WHERE status = 'confirmed')::bigint AS confirmed,
      COALESCE(SUM(net_amount) FILTER (WHERE status IN ('pending', 'partial')), 0)::numeric AS pending_value
    FROM orders
  ),
  item_stats AS (
    SELECT COALESCE(SUM(soi.pending_qty), 0)::numeric AS pending_items
    FROM public.sale_order_items soi
    INNER JOIN orders o ON o.id = soi.order_id
  )
  SELECT
    os.total,
    os.total_value,
    os.pending,
    os.partial,
    os.confirmed,
    ist.pending_items,
    os.pending_value,
    CASE
      WHEN os.total > 0 THEN ROUND((os.confirmed::numeric / os.total::numeric) * 100, 1)
      ELSE 0::numeric
    END AS conversion_rate
  FROM order_stats os
  CROSS JOIN item_stats ist;
$function$;

COMMENT ON FUNCTION public.get_sale_order_dashboard_stats(uuid) IS
  'Org-level Sale Order dashboard KPIs: order counts by status, pending item qty sum, pending order value. '
  'One aggregate row — no line-item payload to the client.';

GRANT EXECUTE ON FUNCTION public.get_sale_order_dashboard_stats(uuid) TO authenticated, service_role;
