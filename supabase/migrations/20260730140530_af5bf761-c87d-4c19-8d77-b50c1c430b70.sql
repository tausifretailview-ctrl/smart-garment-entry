DROP POLICY IF EXISTS "Admins and managers can manage customers" ON public.customers;

CREATE POLICY "Organization members can create customers" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));