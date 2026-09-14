-- Daily salesman incentive (flat ₹ brackets, qty threshold).
-- Org-scoped config + per-salesman per-day locked results.
-- Parallel to %-based commission_rules / salesman_commissions (untouched).

CREATE TABLE IF NOT EXISTS public.daily_salesman_incentive_configs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  qty_threshold numeric NOT NULL DEFAULT 5,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_salesman_incentive_configs_qty_threshold_chk CHECK (qty_threshold >= 0)
);

COMMENT ON TABLE public.daily_salesman_incentive_configs IS
  'Org-scoped daily salesman incentive settings (qty gate). Brackets live in daily_salesman_incentive_brackets.';

CREATE TABLE IF NOT EXISTS public.daily_salesman_incentive_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  min_net_amount numeric NOT NULL DEFAULT 0,
  max_net_amount numeric,
  incentive_amount numeric NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_salesman_incentive_brackets_min_chk CHECK (min_net_amount >= 0),
  CONSTRAINT daily_salesman_incentive_brackets_max_chk
    CHECK (max_net_amount IS NULL OR max_net_amount >= min_net_amount),
  CONSTRAINT daily_salesman_incentive_brackets_amount_chk CHECK (incentive_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_salesman_incentive_brackets_org
  ON public.daily_salesman_incentive_brackets (organization_id, sort_order);

COMMENT ON TABLE public.daily_salesman_incentive_brackets IS
  'Net-sale value brackets → flat ₹ incentive. max_net_amount NULL = open-ended (≥ min).';

CREATE TABLE IF NOT EXISTS public.daily_salesman_incentive_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text NOT NULL,
  incentive_date date NOT NULL,
  total_qty numeric NOT NULL DEFAULT 0,
  total_net_amount numeric NOT NULL DEFAULT 0,
  is_eligible boolean NOT NULL DEFAULT false,
  incentive_amount numeric NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_salesman_incentive_days_org_emp_date_key
    UNIQUE (organization_id, employee_name, incentive_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_salesman_incentive_days_org_date
  ON public.daily_salesman_incentive_days (organization_id, incentive_date DESC);

CREATE INDEX IF NOT EXISTS idx_daily_salesman_incentive_days_employee
  ON public.daily_salesman_incentive_days (organization_id, employee_id, incentive_date DESC);

COMMENT ON TABLE public.daily_salesman_incentive_days IS
  'Per-salesman per-IST-day incentive snapshot. Locked past days are not recomputed (returns must not reverse earned incentive).';

ALTER TABLE public.daily_salesman_incentive_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_salesman_incentive_brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_salesman_incentive_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_daily_salesman_incentive_configs"
  ON public.daily_salesman_incentive_configs
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

CREATE POLICY "org_daily_salesman_incentive_brackets"
  ON public.daily_salesman_incentive_brackets
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

CREATE POLICY "org_daily_salesman_incentive_days"
  ON public.daily_salesman_incentive_days
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

REVOKE ALL ON TABLE public.daily_salesman_incentive_configs FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.daily_salesman_incentive_brackets FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.daily_salesman_incentive_days FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_salesman_incentive_configs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_salesman_incentive_brackets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.daily_salesman_incentive_days TO authenticated;
GRANT ALL ON TABLE public.daily_salesman_incentive_configs TO service_role;
GRANT ALL ON TABLE public.daily_salesman_incentive_brackets TO service_role;
GRANT ALL ON TABLE public.daily_salesman_incentive_days TO service_role;

-- Seed ADEEBAAREEBA (slug adeebaareeba) — verified live id.
-- qty ≥ 5; brackets: [0,500) → ₹3, [500,1000) → ₹5, [1000,∞) → ₹10
INSERT INTO public.daily_salesman_incentive_configs (organization_id, qty_threshold, is_enabled)
VALUES ('b230c582-4f0b-420f-b18b-bef26c2f5ce8', 5, true)
ON CONFLICT (organization_id) DO UPDATE
SET qty_threshold = EXCLUDED.qty_threshold,
    is_enabled = EXCLUDED.is_enabled,
    updated_at = now();

DELETE FROM public.daily_salesman_incentive_brackets
WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8';

INSERT INTO public.daily_salesman_incentive_brackets
  (organization_id, min_net_amount, max_net_amount, incentive_amount, sort_order)
VALUES
  ('b230c582-4f0b-420f-b18b-bef26c2f5ce8', 0,    500,  3,  1),
  ('b230c582-4f0b-420f-b18b-bef26c2f5ce8', 500,  1000, 5,  2),
  ('b230c582-4f0b-420f-b18b-bef26c2f5ce8', 1000, NULL, 10, 3);
