
ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS credit_available_balance NUMERIC;

CREATE TABLE IF NOT EXISTS public.sale_return_invoice_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_invoice_alloc_return
  ON public.sale_return_invoice_allocations (sale_return_id);
CREATE INDEX IF NOT EXISTS idx_sr_invoice_alloc_org
  ON public.sale_return_invoice_allocations (organization_id);

UPDATE public.sale_returns
SET credit_available_balance = net_amount
WHERE credit_available_balance IS NULL
  AND deleted_at IS NULL
  AND (credit_status IS NULL OR credit_status = 'pending');

ALTER TABLE public.sale_return_invoice_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view sr allocations" ON public.sale_return_invoice_allocations;
CREATE POLICY "Org members can view sr allocations"
ON public.sale_return_invoice_allocations
FOR SELECT TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org members can insert sr allocations" ON public.sale_return_invoice_allocations;
CREATE POLICY "Org members can insert sr allocations"
ON public.sale_return_invoice_allocations
FOR INSERT TO authenticated
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org members can update sr allocations" ON public.sale_return_invoice_allocations;
CREATE POLICY "Org members can update sr allocations"
ON public.sale_return_invoice_allocations
FOR UPDATE TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id))
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Org members can delete sr allocations" ON public.sale_return_invoice_allocations;
CREATE POLICY "Org members can delete sr allocations"
ON public.sale_return_invoice_allocations
FOR DELETE TO authenticated
USING (public.user_belongs_to_org(auth.uid(), organization_id));

-- Tighten WhatsApp service-role policies (org context required)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='whatsapp_conversations') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage conversations" ON public.whatsapp_conversations';
    EXECUTE $p$CREATE POLICY "Service role manages conversations with org context"
      ON public.whatsapp_conversations FOR ALL TO service_role
      USING (organization_id IS NOT NULL)
      WITH CHECK (organization_id IS NOT NULL)$p$;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='whatsapp_messages') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Service role can manage messages" ON public.whatsapp_messages';
    EXECUTE $p$CREATE POLICY "Service role manages messages with org context"
      ON public.whatsapp_messages FOR ALL TO service_role
      USING (organization_id IS NOT NULL)
      WITH CHECK (organization_id IS NOT NULL)$p$;
  END IF;
END $$;

-- Server-side admin role helper + admin-only org member writes
CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id AND role = 'admin'
  );
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='organization_members') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Members can update org members" ON public.organization_members';
    EXECUTE 'DROP POLICY IF EXISTS "Members can delete org members" ON public.organization_members';
    EXECUTE 'DROP POLICY IF EXISTS "Members can insert org members" ON public.organization_members';

    EXECUTE $p$CREATE POLICY "Org admins can insert members"
      ON public.organization_members FOR INSERT TO authenticated
      WITH CHECK (public.is_org_admin(auth.uid(), organization_id))$p$;

    EXECUTE $p$CREATE POLICY "Org admins can update members"
      ON public.organization_members FOR UPDATE TO authenticated
      USING (public.is_org_admin(auth.uid(), organization_id))
      WITH CHECK (public.is_org_admin(auth.uid(), organization_id))$p$;

    EXECUTE $p$CREATE POLICY "Org admins can delete members"
      ON public.organization_members FOR DELETE TO authenticated
      USING (public.is_org_admin(auth.uid(), organization_id))$p$;
  END IF;
END $$;
