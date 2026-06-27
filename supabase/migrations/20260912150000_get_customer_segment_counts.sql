-- Main Dashboard customer segment cards: VIP / Regular / Risk / Lost counts
-- Mirrors classifyCustomerSegment + fetchCustomerSegmentIndex in customerSegments.ts

CREATE OR REPLACE FUNCTION public.get_customer_segment_counts(p_org_id uuid)
RETURNS TABLE (
  vip_count bigint,
  regular_count bigint,
  risk_count bigint,
  lost_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH customer_stats AS (
    SELECT
      c.id AS customer_id,
      agg.order_count,
      agg.revenue,
      agg.last_sale_date
    FROM public.customers c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::bigint AS order_count,
        COALESCE(SUM(s.net_amount), 0)::numeric AS revenue,
        MAX(s.sale_date::date) AS last_sale_date
      FROM public.sales s
      WHERE s.customer_id = c.id
        AND s.organization_id = p_org_id
        AND s.deleted_at IS NULL
        AND s.customer_id IS NOT NULL
        AND COALESCE(s.is_cancelled, false) = false
        AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    ) agg ON true
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ),
  classified AS (
    SELECT
      CASE
        WHEN cs.last_sale_date IS NULL THEN 'regular'
        WHEN (CURRENT_DATE - cs.last_sale_date) > 365 THEN 'lost'
        WHEN (CURRENT_DATE - cs.last_sale_date) > 90 THEN 'risk'
        WHEN cs.order_count >= 5 OR cs.revenue >= 50000 THEN 'vip'
        ELSE 'regular'
      END AS segment
    FROM customer_stats cs
  )
  SELECT
    COUNT(*) FILTER (WHERE segment = 'vip')::bigint AS vip_count,
    COUNT(*) FILTER (WHERE segment = 'regular')::bigint AS regular_count,
    COUNT(*) FILTER (WHERE segment = 'risk')::bigint AS risk_count,
    COUNT(*) FILTER (WHERE segment = 'lost')::bigint AS lost_count
  FROM classified;
END;
$$;

COMMENT ON FUNCTION public.get_customer_segment_counts(uuid) IS
  'Dashboard VIP/Regular/Risk/Lost customer counts — same rules as customerSegments.ts classifyCustomerSegment.';

GRANT EXECUTE ON FUNCTION public.get_customer_segment_counts(uuid) TO authenticated, service_role;
