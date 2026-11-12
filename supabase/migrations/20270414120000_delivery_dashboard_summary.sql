-- Delivery Dashboard summary in one request.
--
-- The screen used to read sales.delivery_status / net_amount for every bill the shop
-- ever made, twice (tiles + status pie), plus 7 more requests for the trend chart.
-- PostgREST returns at most 1,000 rows per request, so on any shop past 1,000 bills
-- the tiles and pie counted only the first 1,000 and showed wrong numbers. None of the
-- requests left out deleted bills.
--
-- get_delivery_dashboard_summary counts in the database, over bills that are live:
-- not deleted, not cancelled, and not held (an unsaved POS cart), and returns the
-- tiles, values and a per-day trend (IST days) in one jsonb.

CREATE OR REPLACE FUNCTION public.get_delivery_dashboard_summary(
  p_org_id uuid,
  p_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(coalesce(p_days, 7), 1), 31);
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_totals jsonb;
  v_trend jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR p_org_id IS NULL
     OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'delivered', count(*) FILTER (WHERE s.delivery_status = 'delivered'),
    'pending', count(*) FILTER (WHERE s.delivery_status = 'undelivered'),
    'in_process', count(*) FILTER (WHERE s.delivery_status = 'in_process'),
    'delivered_value', coalesce(sum(s.net_amount) FILTER (WHERE s.delivery_status = 'delivered'), 0),
    'pending_value', coalesce(sum(s.net_amount) FILTER (WHERE s.delivery_status = 'undelivered'), 0)
  )
  INTO v_totals
  FROM public.sales s
  WHERE s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND s.is_cancelled IS DISTINCT FROM true
    AND s.payment_status IS DISTINCT FROM 'hold';

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'day', g.day_ts::date,
           'delivered', c.delivered,
           'pending', c.pending,
           'in_process', c.in_process
         ) ORDER BY g.day_ts), '[]'::jsonb)
  INTO v_trend
  FROM generate_series(v_today - (v_days - 1), v_today, interval '1 day') AS g(day_ts)
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE s.delivery_status = 'delivered') AS delivered,
      count(*) FILTER (WHERE s.delivery_status = 'undelivered') AS pending,
      count(*) FILTER (WHERE s.delivery_status = 'in_process') AS in_process
    FROM public.sales s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND s.is_cancelled IS DISTINCT FROM true
      AND s.payment_status IS DISTINCT FROM 'hold'
      -- One IST calendar day, as a timestamptz range so the sale_date index is used.
      AND s.sale_date >= (g.day_ts::date::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND s.sale_date < ((g.day_ts::date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  ) AS c;

  RETURN v_totals || jsonb_build_object('trend', v_trend);
END;
$$;

REVOKE ALL ON FUNCTION public.get_delivery_dashboard_summary(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_delivery_dashboard_summary(uuid, integer) TO authenticated;
