-- 1. Pin search_path on the two remaining mutable functions
ALTER FUNCTION public.search_sale_items_by_ids(uuid[], text) SET search_path = public;
ALTER FUNCTION public.trg_fix_sale_item_net_after_discount() SET search_path = public;

-- 2. Make the drift view run with the querying user's permissions (RLS enforced)
ALTER VIEW public.supplier_bill_payment_voucher_drift SET (security_invoker = on);

-- 3. Remove the redundant bank-account SELECT policy that exposed soft-deleted rows
DROP POLICY IF EXISTS "Org members can view bank accounts" ON public.organization_bank_accounts;

-- 4. Scope whatsapp_api_settings policies to verified organization membership
DROP POLICY IF EXISTS "Admins and managers can view whatsapp settings" ON public.whatsapp_api_settings;
DROP POLICY IF EXISTS "Admins and managers can insert whatsapp settings" ON public.whatsapp_api_settings;
DROP POLICY IF EXISTS "Admins and managers can update whatsapp settings" ON public.whatsapp_api_settings;
DROP POLICY IF EXISTS "Admins and managers can delete whatsapp settings" ON public.whatsapp_api_settings;

CREATE POLICY "Admins and managers can view whatsapp settings"
ON public.whatsapp_api_settings
FOR SELECT
TO authenticated
USING (
  public.user_belongs_to_org((SELECT auth.uid()), organization_id)
  AND (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can insert whatsapp settings"
ON public.whatsapp_api_settings
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_org((SELECT auth.uid()), organization_id)
  AND (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can update whatsapp settings"
ON public.whatsapp_api_settings
FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_org((SELECT auth.uid()), organization_id)
  AND (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
  )
)
WITH CHECK (
  public.user_belongs_to_org((SELECT auth.uid()), organization_id)
  AND (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Admins and managers can delete whatsapp settings"
ON public.whatsapp_api_settings
FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_org((SELECT auth.uid()), organization_id)
  AND (
    public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
    OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
  )
);