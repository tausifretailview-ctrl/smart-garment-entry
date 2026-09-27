-- Daily salesman incentive: pick the ₹/piece bracket from the price PER PIECE
-- (line net after discount ÷ qty), not from the whole line total.
--
-- Before: a line of 2 × ₹900 (line net ₹1,800) fell in the ≥ ₹1,000 bracket and
-- paid ₹10 × 2 = ₹20, while the same kurti sold singly at ₹850 paid ₹5.
-- After:  2 × ₹900 pays ₹5 × 2 = ₹10. Mirrors src/utils/dailySalesmanIncentive.ts.
--
-- Same body as 20260916180000_sale_items_per_line_salesman.sql except the bracket
-- lookup (l.qty > 0 is guaranteed by the lines CTE filter).

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
            AND (l.line_net / l.qty) >= b.min_net_amount
            AND (b.max_net_amount IS NULL OR (l.line_net / l.qty) < b.max_net_amount)
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
  'Read-only per-salesman daily incentive for one IST calendar day. Bracket(line net / qty) × qty summed; day qty gate from config. Line salesman via COALESCE(sale_items.salesman, sales.salesman).';

-- Recalculate past days (owner-approved 2026-09-27): clear stored snapshots for the
-- two Adeeba orgs so sync_daily_salesman_incentive_days recomputes them with the
-- per-piece rule and re-locks past IST days the next time the Daily incentive tab
-- loads that range.
-- Tag: [daily_incentive_per_piece_recalc_20260927]
DELETE FROM public.daily_salesman_incentive_days
WHERE organization_id IN (
  'b230c582-4f0b-420f-b18b-bef26c2f5ce8', -- ADEEBAAREEBA
  '0dac440f-e962-4f27-a38d-71c81f9c52b7'  -- ADEEBA AREEBA STUDIO
);

COMMENT ON TABLE public.daily_salesman_incentive_days IS
  'Per-salesman per-IST-day incentive snapshot. Locked past days are not recomputed on refresh (returns must not reverse earned incentive). Snapshots cleared 2026-09-15 (per-unit formula) and 2026-09-27 (bracket on per-piece net instead of full line net).';
