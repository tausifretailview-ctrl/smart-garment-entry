-- Main Dashboard sales trend chart: daily net_amount totals for last N days.
-- Matches StatsChartsSection raw sales query (deleted_at only, no is_cancelled filter).

CREATE OR REPLACE FUNCTION public.get_sales_daily_summary(
  p_org_id uuid,
  p_days integer DEFAULT 7
)
RETURNS TABLE (
  sale_day date,
  total_amount numeric,
  sale_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 7), 1);
  v_start date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_start := (timezone('Asia/Kolkata', now()))::date - (v_days - 1);

  RETURN QUERY
  SELECT
    (timezone('Asia/Kolkata', s.sale_date))::date AS sale_day,
    COALESCE(SUM(s.net_amount), 0)::numeric AS total_amount,
    COUNT(*)::bigint AS sale_count
  FROM public.sales s
  WHERE s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND (timezone('Asia/Kolkata', s.sale_date))::date >= v_start
  GROUP BY (timezone('Asia/Kolkata', s.sale_date))::date
  ORDER BY sale_day ASC;
END;
$$;

COMMENT ON FUNCTION public.get_sales_daily_summary(uuid, integer) IS
  'Daily sales totals for Main Dashboard charts (last N IST calendar days).';

GRANT EXECUTE ON FUNCTION public.get_sales_daily_summary(uuid, integer) TO authenticated, service_role;
