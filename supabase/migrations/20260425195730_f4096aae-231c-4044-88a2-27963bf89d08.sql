
-- 1) Fix sale_financer_details: replace broken self-referential policies with proper org membership checks
DROP POLICY IF EXISTS "Users can view financer details for their org" ON public.sale_financer_details;
DROP POLICY IF EXISTS "Users can insert financer details for their org" ON public.sale_financer_details;
DROP POLICY IF EXISTS "Users can update financer details for their org" ON public.sale_financer_details;
DROP POLICY IF EXISTS "Users can delete financer details for their org" ON public.sale_financer_details;

CREATE POLICY "Org members can view financer details"
ON public.sale_financer_details FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert financer details"
ON public.sale_financer_details FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update financer details"
ON public.sale_financer_details FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete financer details"
ON public.sale_financer_details FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 2) Enable RLS on customer_ledger_entries and restrict to org members
ALTER TABLE public.customer_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view customer ledger entries"
ON public.customer_ledger_entries FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert customer ledger entries"
ON public.customer_ledger_entries FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update customer ledger entries"
ON public.customer_ledger_entries FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete customer ledger entries"
ON public.customer_ledger_entries FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 3) Remove privilege escalation: users can no longer self-assign roles in user_roles
DROP POLICY IF EXISTS "Users can create their own roles" ON public.user_roles;
