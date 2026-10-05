-- Rehmani NX daily incentive: ₹10 per piece after a day quantity gate, plus one
-- bill slab (highest match). ADEEBAAREEBA configs, brackets, and stored days are
-- not updated. With no bill slabs, compute_daily_salesman_incentive stays the
-- per-piece bracket total.

CREATE TABLE IF NOT EXISTS public.daily_salesman_incentive_bill_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_bill_amount numeric NOT NULL,
  incentive_amount numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_salesman_incentive_bill_slabs_min_chk CHECK (min_bill_amount >= 0),
  CONSTRAINT daily_salesman_incentive_bill_slabs_amount_chk CHECK (incentive_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_salesman_incentive_bill_slabs_org
  ON public.daily_salesman_incentive_bill_slabs (organization_id, min_bill_amount);

COMMENT ON TABLE public.daily_salesman_incentive_bill_slabs IS
  'Optional extra incentive once per bill. The highest min_bill_amount the bill reaches is paid. Empty for an org means piece brackets only.';

ALTER TABLE public.daily_salesman_incentive_bill_slabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_daily_salesman_incentive_bill_slabs"
  ON public.daily_salesman_incentive_bill_slabs;

CREATE POLICY "org_daily_salesman_incentive_bill_slabs"
  ON public.daily_salesman_incentive_bill_slabs
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.daily_salesman_incentive_bill_slabs FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_salesman_incentive_bill_slabs TO authenticated;
GRANT ALL ON TABLE public.daily_salesman_incentive_bill_slabs TO service_role;

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
  ),
  bill_owners AS (
    SELECT sale_id, MAX(bill_net) AS bill_net, MIN(salesman) AS salesman
    FROM lines
    GROUP BY sale_id
    HAVING COUNT(DISTINCT salesman) = 1
  ),
  bill_bonus AS (
    SELECT
      bo.salesman,
      SUM(
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
        )
      ) AS bonus
    FROM bill_owners bo
    GROUP BY bo.salesman
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
  'Per-salesman daily incentive for one IST day. Piece bracket(line net / qty) × qty, plus the highest bill slab once per single-salesman bill. Day qty gate applies to the total. No slabs leaves the piece total unchanged.';

REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.compute_daily_salesman_incentive(uuid, date) TO authenticated, service_role;

-- REHMANI NX (slug rahmani-nx). Insert only when that org has no rows yet.
INSERT INTO public.daily_salesman_incentive_configs (organization_id, qty_threshold, is_enabled)
VALUES ('e2e13e68-784e-42d1-a461-df2fd5beb963', 5, true)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.daily_salesman_incentive_brackets
  (organization_id, min_net_amount, max_net_amount, incentive_amount, sort_order)
SELECT 'e2e13e68-784e-42d1-a461-df2fd5beb963', 0, NULL, 10, 1
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_salesman_incentive_brackets
  WHERE organization_id = 'e2e13e68-784e-42d1-a461-df2fd5beb963'
);

INSERT INTO public.daily_salesman_incentive_bill_slabs
  (organization_id, min_bill_amount, incentive_amount, sort_order)
SELECT v.organization_id, v.min_bill_amount, v.incentive_amount, v.sort_order
FROM (
  VALUES
    ('e2e13e68-784e-42d1-a461-df2fd5beb963'::uuid, 10000::numeric, 100::numeric, 1),
    ('e2e13e68-784e-42d1-a461-df2fd5beb963'::uuid, 15000::numeric, 200::numeric, 2)
) AS v(organization_id, min_bill_amount, incentive_amount, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.daily_salesman_incentive_bill_slabs s
  WHERE s.organization_id = v.organization_id
);
