-- Discount schemes (multi-scheme ready) + rule change history.
-- Existing category_quantity_tier_pricing rows migrate into a default scheme per org.

CREATE TABLE IF NOT EXISTS public.discount_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discount_schemes_org_default_uidx
  ON public.discount_schemes (organization_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS discount_schemes_org_active_idx
  ON public.discount_schemes (organization_id, is_active);

COMMENT ON TABLE public.discount_schemes IS
  'Named discount schemes; category tier rules belong to a scheme (multi-scheme ready).';

ALTER TABLE public.category_quantity_tier_pricing
  ADD COLUMN IF NOT EXISTS scheme_id uuid REFERENCES public.discount_schemes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS category_quantity_tier_pricing_scheme_idx
  ON public.category_quantity_tier_pricing (scheme_id);

-- Backfill: one default scheme per org that already has tier rules.
INSERT INTO public.discount_schemes (organization_id, name, description, is_active, is_default)
SELECT DISTINCT organization_id, 'Default Scheme', 'Migrated from category tier rules', true, true
FROM public.category_quantity_tier_pricing
WHERE scheme_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.discount_schemes ds
    WHERE ds.organization_id = category_quantity_tier_pricing.organization_id
      AND ds.is_default = true
  );

-- Attach orphan rules to their org default scheme (Postgres lacks ON CONFLICT for partial unique — use UPDATE).
UPDATE public.category_quantity_tier_pricing r
SET scheme_id = ds.id
FROM public.discount_schemes ds
WHERE r.scheme_id IS NULL
  AND ds.organization_id = r.organization_id
  AND ds.is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS category_quantity_tier_pricing_scheme_category_uidx
  ON public.category_quantity_tier_pricing (scheme_id, lower(trim(category)))
  WHERE scheme_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.discount_scheme_rule_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scheme_id uuid REFERENCES public.discount_schemes(id) ON DELETE SET NULL,
  rule_id uuid,
  action text NOT NULL,
  category text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discount_scheme_rule_history_action_chk
    CHECK (action IN ('created', 'updated', 'deleted', 'deactivated', 'activated'))
);

CREATE INDEX IF NOT EXISTS discount_scheme_rule_history_org_created_idx
  ON public.discount_scheme_rule_history (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS discount_scheme_rule_history_scheme_idx
  ON public.discount_scheme_rule_history (scheme_id, created_at DESC);

COMMENT ON TABLE public.discount_scheme_rule_history IS
  'Audit trail for category tier rule changes on discount schemes.';

CREATE TRIGGER trg_discount_schemes_updated_at
  BEFORE UPDATE ON public.discount_schemes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.discount_schemes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_scheme_rule_history ENABLE ROW LEVEL SECURITY;

-- ---------- discount_schemes ----------
DROP POLICY IF EXISTS "Org members can view discount schemes" ON public.discount_schemes;
CREATE POLICY "Org members can view discount schemes"
  ON public.discount_schemes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert discount schemes" ON public.discount_schemes;
CREATE POLICY "Admins and managers can insert discount schemes"
  ON public.discount_schemes FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update discount schemes" ON public.discount_schemes;
CREATE POLICY "Admins and managers can update discount schemes"
  ON public.discount_schemes FOR UPDATE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  )
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can delete discount schemes" ON public.discount_schemes;
CREATE POLICY "Admins and managers can delete discount schemes"
  ON public.discount_schemes FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

-- ---------- discount_scheme_rule_history ----------
DROP POLICY IF EXISTS "Org members can view discount scheme history" ON public.discount_scheme_rule_history;
CREATE POLICY "Org members can view discount scheme history"
  ON public.discount_scheme_rule_history FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert discount scheme history" ON public.discount_scheme_rule_history;
CREATE POLICY "Admins and managers can insert discount scheme history"
  ON public.discount_scheme_rule_history FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

REVOKE ALL ON public.discount_schemes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_schemes TO authenticated;
GRANT ALL ON public.discount_schemes TO service_role;

REVOKE ALL ON public.discount_scheme_rule_history FROM PUBLIC;
GRANT SELECT, INSERT ON public.discount_scheme_rule_history TO authenticated;
GRANT ALL ON public.discount_scheme_rule_history TO service_role;
