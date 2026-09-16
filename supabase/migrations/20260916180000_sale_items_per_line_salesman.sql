-- Per-line salesman on sale_items (POS-only, org-gated via sale_settings.pos_per_line_salesman).
-- Header sales.salesman remains the default; COALESCE(line, header) for attribution.

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS salesman text;

COMMENT ON COLUMN public.sale_items.salesman IS
  'Optional per-line salesperson override. When NULL, attribution falls back to sales.salesman.';

-- Enable for ADEEBAAREEBA only (slug adeebaareeba).
UPDATE public.settings
SET sale_settings = jsonb_set(
      COALESCE(sale_settings, '{}'::jsonb),
      '{pos_per_line_salesman}',
      'true'::jsonb,
      true
    ),
    updated_at = now()
WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8';

-- Daily incentive RPC: attribute each line via COALESCE(si.salesman, s.salesman).
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
  'Read-only per-salesman daily incentive for one IST calendar day. Bracket(full line net) × qty summed; day qty gate from config. Line salesman via COALESCE(sale_items.salesman, sales.salesman).';
