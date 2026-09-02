-- Phase 2: org-scoped dashboard summary RPCs.
-- Replaces StatusBar / StatsChartsSection reads of security_invoker views whose
-- RLS membership subquery does not reliably push down through GROUP BY.
-- Query bodies match the live views (stock: 20260404193145; purchase: 20261122120000)
-- plus an explicit organization_id predicate. Views are left in place.

CREATE OR REPLACE FUNCTION public.get_dashboard_stock_summary(p_org_id uuid)
RETURNS TABLE (
  organization_id     uuid,
  total_stock_qty     bigint,
  total_stock_value   numeric,
  total_sale_value    numeric,
  total_variant_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pv.organization_id,
    COALESCE(SUM(pv.current_stock), 0)::bigint AS total_stock_qty,
    COALESCE(SUM(pv.current_stock::numeric * COALESCE(pv.pur_price, 0)), 0)::numeric AS total_stock_value,
    COALESCE(SUM(pv.current_stock::numeric * COALESCE(pv.sale_price, 0)), 0)::numeric AS total_sale_value,
    COUNT(*)::int AS total_variant_count
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active = true
    AND p.product_type != 'service'
  GROUP BY pv.organization_id;
END;
$$;

COMMENT ON FUNCTION public.get_dashboard_stock_summary(uuid) IS
  'Org-scoped stock tile for StatusBar. Same aggregates as v_dashboard_stock_summary with an explicit organization_id filter. SECURITY DEFINER, fail-closed auth.role() guard.';

REVOKE ALL ON FUNCTION public.get_dashboard_stock_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_stock_summary(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stock_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_purchase_summary(
  p_org_id uuid,
  p_from_day date DEFAULT NULL
)
RETURNS TABLE (
  organization_id        uuid,
  purchase_day           date,
  bill_count             bigint,
  total_purchase_amount  numeric,
  total_paid_amount      numeric,
  total_pending_amount   numeric,
  total_items_purchased  numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
  WHERE p.organization_id = p_org_id
    AND p.deleted_at IS NULL
    AND COALESCE(p.is_cancelled, false) = false
    AND (p_from_day IS NULL OR p.bill_date >= p_from_day)
  GROUP BY p.organization_id, p.bill_date;
END;
$$;

COMMENT ON FUNCTION public.get_dashboard_purchase_summary(uuid, date) IS
  'Org-scoped daily purchase rollup for Main Dashboard charts. Same aggregates as v_dashboard_purchase_summary with an explicit organization_id filter. Optional p_from_day matches the existing 7-day client bound. SECURITY DEFINER, fail-closed auth.role() guard.';

REVOKE ALL ON FUNCTION public.get_dashboard_purchase_summary(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_purchase_summary(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_purchase_summary(uuid, date) TO authenticated, service_role;
