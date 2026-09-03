-- Phase 2 leftover — purchase summary RPC only.
-- Catalog 2026-09-03 11:21 UTC: get_dashboard_stock_summary exists with
-- SUM(pv.stock_qty) (Phase 7). get_dashboard_purchase_summary does not exist.
-- Do NOT re-run the stock function (that would revert to current_stock).
-- Paste this entire file and Run. Do not paste Markdown.

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
