-- Sale Order Dashboard: stats RPC timeout on large org histories (e.g. KS FOOTWEAR ~1.8k orders).
--
-- 1) Partial composite indexes for org-scoped aggregates and open-order item joins
-- 2) get_sale_order_dashboard_stats — single org scan + indexed item join, fail-closed auth
-- 3) get_sale_order_customer_options — one DISTINCT round-trip (replaces client pagination)

-- ---------------------------------------------------------------------------
-- Indexes (partial: active rows only — matches deleted_at IS NULL filters)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sale_orders_org_active_status
  ON public.sale_orders (organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_orders_org_open_order_id
  ON public.sale_orders (organization_id, id)
  WHERE deleted_at IS NULL AND status IN ('pending', 'partial');

CREATE INDEX IF NOT EXISTS idx_sale_orders_org_active_customer_name
  ON public.sale_orders (organization_id, customer_name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_order_items_order_pending_qty
  ON public.sale_order_items (order_id)
  INCLUDE (pending_qty);

-- ---------------------------------------------------------------------------
-- Dashboard KPI stats (output-identical to 20260911200000; planner-friendly shape)
-- ---------------------------------------------------------------------------
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_total_value numeric;
  v_pending bigint;
  v_partial bigint;
  v_confirmed bigint;
  v_pending_value numeric;
  v_pending_items numeric;
  v_pending_items_open numeric;
  v_pending_items_closed numeric;
BEGIN
  PERFORM public.assert_org_member(p_organization_id);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(o.net_amount), 0)::numeric,
    COUNT(*) FILTER (WHERE o.status = 'pending')::bigint,
    COUNT(*) FILTER (WHERE o.status = 'partial')::bigint,
    COUNT(*) FILTER (WHERE o.status = 'confirmed')::bigint,
    COALESCE(SUM(o.net_amount) FILTER (WHERE o.status IN ('pending', 'partial')), 0)::numeric
  INTO
    v_total,
    v_total_value,
    v_pending,
    v_partial,
    v_confirmed,
    v_pending_value
  FROM public.sale_orders o
  WHERE o.organization_id = p_organization_id
    AND o.deleted_at IS NULL;

  -- pending_items: open orders first (hot path for high-volume orgs), then closed-status orders
  -- (byte-identical to one join over all orders; closed branch is cheap when few confirmed/cancelled).
  SELECT COALESCE(SUM(soi.pending_qty), 0)::numeric
  INTO v_pending_items_open
  FROM public.sale_order_items soi
  INNER JOIN public.sale_orders o
    ON o.id = soi.order_id
   AND o.organization_id = p_organization_id
   AND o.deleted_at IS NULL
   AND o.status IN ('pending', 'partial');

  SELECT COALESCE(SUM(soi.pending_qty), 0)::numeric
  INTO v_pending_items_closed
  FROM public.sale_order_items soi
  INNER JOIN public.sale_orders o
    ON o.id = soi.order_id
   AND o.organization_id = p_organization_id
   AND o.deleted_at IS NULL
   AND o.status NOT IN ('pending', 'partial');

  v_pending_items := COALESCE(v_pending_items_open, 0) + COALESCE(v_pending_items_closed, 0);

  RETURN QUERY
  SELECT
    v_total,
    v_total_value,
    v_pending,
    v_partial,
    v_confirmed,
    v_pending_items,
    v_pending_value,
    CASE
      WHEN v_total > 0 THEN ROUND((v_confirmed::numeric / v_total::numeric) * 100, 1)
      ELSE 0::numeric
    END;
END;
$$;

COMMENT ON FUNCTION public.get_sale_order_dashboard_stats(uuid) IS
  'Org-level Sale Order dashboard KPIs. One aggregate row; org-scoped index-friendly scans.';

REVOKE ALL ON FUNCTION public.get_sale_order_dashboard_stats(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sale_order_dashboard_stats(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sale_order_dashboard_stats(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Customer filter dropdown — DISTINCT in one query (no client-side pagination)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sale_order_customer_options(p_organization_id uuid)
RETURNS TABLE(
  customer_id uuid,
  customer_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_member(p_organization_id);

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id required';
  END IF;

  RETURN QUERY
  SELECT DISTINCT so.customer_id, so.customer_name
  FROM public.sale_orders so
  WHERE so.organization_id = p_organization_id
    AND so.deleted_at IS NULL
    AND so.customer_name IS NOT NULL
    AND btrim(so.customer_name) <> ''
  ORDER BY so.customer_name;
END;
$$;

COMMENT ON FUNCTION public.get_sale_order_customer_options(uuid) IS
  'Distinct customer_id/name pairs for Sale Order Dashboard filter (all-time, org-scoped).';

REVOKE ALL ON FUNCTION public.get_sale_order_customer_options(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_sale_order_customer_options(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_sale_order_customer_options(uuid) TO authenticated, service_role;
