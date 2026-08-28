-- Category quantity-tier bundle pricing (Trendzo Discount Scheme).
-- Org opt-in via sale_settings.pos_category_tier_pricing; rules live here.

CREATE TABLE IF NOT EXISTS public.category_quantity_tier_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  category text NOT NULL,
  single_unit_price numeric(12, 2) NOT NULL,
  tier_qty integer NOT NULL,
  tier_total_price numeric(12, 2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT category_quantity_tier_pricing_tier_qty_chk CHECK (tier_qty >= 2),
  CONSTRAINT category_quantity_tier_pricing_prices_chk CHECK (
    single_unit_price > 0 AND tier_total_price > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS category_quantity_tier_pricing_org_category_uidx
  ON public.category_quantity_tier_pricing (organization_id, lower(trim(category)));

CREATE INDEX IF NOT EXISTS category_quantity_tier_pricing_org_active_idx
  ON public.category_quantity_tier_pricing (organization_id, is_active);

COMMENT ON TABLE public.category_quantity_tier_pricing IS
  'Per-org category bundle pricing: tier_qty items for tier_total_price; remainder at single_unit_price.';

CREATE TRIGGER trg_category_quantity_tier_pricing_updated_at
  BEFORE UPDATE ON public.category_quantity_tier_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.category_quantity_tier_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view category tier pricing" ON public.category_quantity_tier_pricing;
CREATE POLICY "Org members can view category tier pricing"
  ON public.category_quantity_tier_pricing FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Admins and managers can insert category tier pricing" ON public.category_quantity_tier_pricing;
CREATE POLICY "Admins and managers can insert category tier pricing"
  ON public.category_quantity_tier_pricing FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Admins and managers can update category tier pricing" ON public.category_quantity_tier_pricing;
CREATE POLICY "Admins and managers can update category tier pricing"
  ON public.category_quantity_tier_pricing FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "Admins and managers can delete category tier pricing" ON public.category_quantity_tier_pricing;
CREATE POLICY "Admins and managers can delete category tier pricing"
  ON public.category_quantity_tier_pricing FOR DELETE TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND (
      public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
      OR public.has_org_role(auth.uid(), organization_id, 'manager'::public.app_role)
    )
  );

REVOKE ALL ON public.category_quantity_tier_pricing FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_quantity_tier_pricing TO authenticated;
GRANT ALL ON public.category_quantity_tier_pricing TO service_role;
