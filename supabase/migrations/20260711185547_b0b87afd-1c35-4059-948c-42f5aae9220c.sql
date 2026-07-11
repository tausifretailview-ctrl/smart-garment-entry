
ALTER FUNCTION public._draft_references_product(jsonb, uuid) SET search_path = public;
ALTER FUNCTION public._held_cart_references_product(jsonb, uuid) SET search_path = public;
ALTER FUNCTION public._school_fee_map_payment_method(text) SET search_path = public;
ALTER FUNCTION public.sale_settlement_tolerance() SET search_path = public;

-- Prevent self role escalation: org admins cannot update their own membership row.
DROP POLICY IF EXISTS "Admins can manage members in their organization" ON public.organization_members;
CREATE POLICY "Admins can manage members in their organization"
ON public.organization_members
FOR UPDATE
USING (
  public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  AND user_id <> auth.uid()
)
WITH CHECK (
  public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  AND user_id <> auth.uid()
);

DROP POLICY IF EXISTS "Org admins can update members" ON public.organization_members;
CREATE POLICY "Org admins can update members"
ON public.organization_members
FOR UPDATE
USING (
  public.is_org_admin(auth.uid(), organization_id)
  AND user_id <> auth.uid()
)
WITH CHECK (
  public.is_org_admin(auth.uid(), organization_id)
  AND user_id <> auth.uid()
);
