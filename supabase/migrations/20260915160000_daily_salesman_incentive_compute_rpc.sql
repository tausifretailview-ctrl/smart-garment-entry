-- Server-side daily salesman incentive aggregation (per-unit bracket × line qty).
-- Replaces client fetch of raw sales + sale_items + JS reduce.
-- Formula mirrors src/utils/dailySalesmanIncentive.ts and verify-adeeba-daily-salesman-incentive.sql.

CREATE OR REPLACE FUNCTION public.compute_daily_salesman_incentive(
  p_org_id uuid,
  p_incentive_date date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  incentive_date date,
  total_qty numeric,
  total_net_amount numeric,
  is_eligible boolean,
  incentive_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_qty_threshold numeric;
BEGIN
  IF p_org_id IS NULL OR p_incentive_date IS NULL THEN
    RAISE EXCEPTION 'p_org_id and p_incentive_date are required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT cfg.qty_threshold
  INTO v_qty_threshold
  FROM public.daily_salesman_incentive_configs cfg
  WHERE cfg.organization_id = p_org_id
    AND cfg.is_enabled = true;

  IF v_qty_threshold IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lines AS (
    SELECT
      btrim(s.salesman) AS salesman,
      si.quantity::numeric AS qty,
      GREATEST(0::numeric, COALESCE(si.net_after_discount, si.line_total, 0)::numeric) AS line_net
    FROM public.sales s
    INNER JOIN public.sale_items si
      ON si.sale_id = s.id
     AND si.deleted_at IS NULL
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date = p_incentive_date
      AND btrim(COALESCE(s.salesman, '')) <> ''
      AND COALESCE(si.quantity, 0) > 0
  ),
  per_line AS (
    SELECT
      l.salesman,
      l.qty,
      l.line_net,
      COALESCE(
        (
          SELECT b.incentive_amount
          FROM public.daily_salesman_incentive_brackets b
          WHERE b.organization_id = p_org_id
            AND l.line_net >= b.min_net_amount
            AND (b.max_net_amount IS NULL OR l.line_net < b.max_net_amount)
          ORDER BY b.sort_order, b.min_net_amount
          LIMIT 1
        ),
        0::numeric
      ) AS per_unit_inr
    FROM lines l
  ),
  day_agg AS (
    SELECT
      pl.salesman,
      SUM(pl.qty) AS total_qty,
      SUM(pl.line_net) AS total_net,
      SUM(pl.per_unit_inr * pl.qty) AS line_incentive_sum
    FROM per_line pl
    GROUP BY pl.salesman
  )
  SELECT
    e.id AS employee_id,
    d.salesman AS employee_name,
    p_incentive_date AS incentive_date,
    d.total_qty,
    ROUND(d.total_net, 2) AS total_net_amount,
    (d.total_qty >= v_qty_threshold) AS is_eligible,
    CASE
      WHEN d.total_qty >= v_qty_threshold THEN ROUND(d.line_incentive_sum, 2)
      ELSE 0::numeric
    END AS incentive_amount
  FROM day_agg d
  LEFT JOIN public.employees e
    ON e.organization_id = p_org_id
   AND e.employee_name = d.salesman
   AND e.deleted_at IS NULL
  ORDER BY d.salesman;
END;
$$;

COMMENT ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) IS
  'Read-only per-salesman daily incentive for one IST calendar day. Bracket(full line net) × qty summed; day qty gate from config.';

CREATE OR REPLACE FUNCTION public.sync_daily_salesman_incentive_days(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  employee_name text,
  incentive_date date,
  total_qty numeric,
  total_net_amount numeric,
  is_eligible boolean,
  incentive_amount numeric,
  is_locked boolean,
  computed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
  v_today date;
  v_existing_count int;
  v_locked_count int;
  v_lock boolean;
  r record;
BEGIN
  IF p_org_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RAISE EXCEPTION 'p_org_id, p_start_date, and p_end_date are required';
  END IF;
  IF p_end_date < p_start_date THEN
    RAISE EXCEPTION 'p_end_date must be on or after p_start_date';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.daily_salesman_incentive_configs cfg
    WHERE cfg.organization_id = p_org_id
      AND cfg.is_enabled = true
  ) THEN
    RETURN;
  END IF;

  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;

  v_day := p_start_date;
  WHILE v_day <= p_end_date LOOP
    SELECT COUNT(*), COUNT(*) FILTER (WHERE d.is_locked)
    INTO v_existing_count, v_locked_count
    FROM public.daily_salesman_incentive_days d
    WHERE d.organization_id = p_org_id
      AND d.incentive_date = v_day;

    IF v_day < v_today AND v_existing_count > 0 AND v_locked_count = v_existing_count THEN
      -- Past day fully locked — stored snapshot wins.
      NULL;
    ELSE
      v_lock := (v_day < v_today);

      FOR r IN
        SELECT *
        FROM public.compute_daily_salesman_incentive(p_org_id, v_day) c
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.daily_salesman_incentive_days d
          WHERE d.organization_id = p_org_id
            AND d.incentive_date = v_day
            AND d.employee_name = c.employee_name
            AND d.is_locked = true
        )
      LOOP
        INSERT INTO public.daily_salesman_incentive_days AS d (
          organization_id,
          employee_id,
          employee_name,
          incentive_date,
          total_qty,
          total_net_amount,
          is_eligible,
          incentive_amount,
          is_locked,
          computed_at,
          updated_at
        )
        VALUES (
          p_org_id,
          r.employee_id,
          r.employee_name,
          v_day,
          r.total_qty,
          r.total_net_amount,
          r.is_eligible,
          r.incentive_amount,
          v_lock,
          now(),
          now()
        )
        ON CONFLICT ON CONSTRAINT daily_salesman_incentive_days_org_emp_date_key
        DO UPDATE SET
          employee_id = EXCLUDED.employee_id,
          total_qty = EXCLUDED.total_qty,
          total_net_amount = EXCLUDED.total_net_amount,
          is_eligible = EXCLUDED.is_eligible,
          incentive_amount = EXCLUDED.incentive_amount,
          is_locked = EXCLUDED.is_locked,
          computed_at = EXCLUDED.computed_at,
          updated_at = EXCLUDED.updated_at
        WHERE d.is_locked = false;
      END LOOP;
    END IF;

    v_day := v_day + 1;
  END LOOP;

  RETURN QUERY
  SELECT
    d.id,
    d.employee_id,
    d.employee_name,
    d.incentive_date,
    d.total_qty,
    d.total_net_amount,
    d.is_eligible,
    d.incentive_amount,
    d.is_locked,
    d.computed_at
  FROM public.daily_salesman_incentive_days d
  WHERE d.organization_id = p_org_id
    AND d.incentive_date >= p_start_date
    AND d.incentive_date <= p_end_date
  ORDER BY d.incentive_date DESC, d.employee_name ASC;
END;
$$;

COMMENT ON FUNCTION public.sync_daily_salesman_incentive_days(uuid, date, date) IS
  'Load daily incentive rows for a date range. Past fully-locked IST days are read-only; missing past days compute+lock once; today recomputes live (unlocked). Returns stored rows only.';

REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_daily_salesman_incentive_days(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_daily_salesman_incentive_days(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_daily_salesman_incentive_days(uuid, date, date) TO authenticated, service_role;
