-- Daily incentive: a bill that earns a bill slab pays only the slab. Its pieces
-- get no per-piece incentive but still count toward the day's minimum quantity.
-- Before, a ₹15,000 bill paid ₹200 plus ₹10 per piece. Orgs with no bill slabs
-- (ADEEBAAREEBA) are unchanged. Locked past days are not recomputed.

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
      s.id AS sale_id,
      GREATEST(0::numeric, COALESCE(s.net_amount, 0)::numeric) AS bill_net,
      btrim(COALESCE(NULLIF(btrim(si.salesman), ''), s.salesman)) AS salesman,
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
      AND btrim(COALESCE(NULLIF(btrim(si.salesman), ''), s.salesman, '')) <> ''
      AND COALESCE(si.quantity, 0) > 0
  ),
  bill_owners AS (
    SELECT sale_id, MAX(bill_net) AS bill_net, MIN(salesman) AS salesman
    FROM lines
    GROUP BY sale_id
    HAVING COUNT(DISTINCT salesman) = 1
  ),
  bill_slab AS (
    SELECT
      bo.sale_id,
      bo.salesman,
      COALESCE(
        (
          SELECT sl.incentive_amount
          FROM public.daily_salesman_incentive_bill_slabs sl
          WHERE sl.organization_id = p_org_id
            AND bo.bill_net >= sl.min_bill_amount
          ORDER BY sl.min_bill_amount DESC, sl.sort_order
          LIMIT 1
        ),
        0::numeric
      ) AS bonus
    FROM bill_owners bo
  ),
  bill_bonus AS (
    SELECT bs.salesman, SUM(bs.bonus) AS bonus
    FROM bill_slab bs
    WHERE bs.bonus > 0
    GROUP BY bs.salesman
  ),
  per_line AS (
    SELECT
      l.salesman,
      l.qty,
      l.line_net,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM bill_slab bs WHERE bs.sale_id = l.sale_id AND bs.bonus > 0
        ) THEN 0::numeric
        ELSE COALESCE(
        (
          SELECT b.incentive_amount
          FROM public.daily_salesman_incentive_brackets b
          WHERE b.organization_id = p_org_id
            AND (l.line_net / l.qty) >= b.min_net_amount
            AND (b.max_net_amount IS NULL OR (l.line_net / l.qty) < b.max_net_amount)
          ORDER BY b.sort_order, b.min_net_amount
          LIMIT 1
        ),
        0::numeric
      )
      END AS per_unit_inr
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
  ),
  combined AS (
    SELECT
      COALESCE(d.salesman, bb.salesman) AS salesman,
      COALESCE(d.total_qty, 0) AS total_qty,
      COALESCE(d.total_net, 0) AS total_net,
      COALESCE(d.line_incentive_sum, 0) AS line_incentive_sum,
      COALESCE(bb.bonus, 0) AS bill_bonus
    FROM day_agg d
    FULL OUTER JOIN bill_bonus bb ON bb.salesman = d.salesman
  )
  SELECT
    e.id AS employee_id,
    c.salesman AS employee_name,
    p_incentive_date AS incentive_date,
    c.total_qty,
    ROUND(c.total_net, 2) AS total_net_amount,
    (c.total_qty >= v_qty_threshold) AS is_eligible,
    CASE
      WHEN c.total_qty >= v_qty_threshold THEN ROUND(c.line_incentive_sum + c.bill_bonus, 2)
      ELSE 0::numeric
    END AS incentive_amount
  FROM combined c
  LEFT JOIN public.employees e
    ON e.organization_id = p_org_id
   AND e.employee_name = c.salesman
   AND e.deleted_at IS NULL
  WHERE c.total_qty > 0 OR c.bill_bonus > 0
  ORDER BY c.salesman;
END;
$$;

COMMENT ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) IS
  'Per-salesman daily incentive for one IST day. Piece bracket(line net / qty) × qty, except on a single-salesman bill that reaches a bill slab: that bill pays the highest slab once instead, and its pieces still count toward the day qty. Day qty gate applies to the total. No slabs leaves the piece total unchanged.';

REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) TO authenticated, service_role;

