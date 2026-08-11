ALTER POLICY "Admins and managers can update customers" ON public.customers
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete customers" ON public.customers
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Organization members can create customers" ON public.customers
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view customers in their organizations" ON public.customers
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can insert purchase bills" ON public.purchase_bills
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins and managers can view purchase bills" ON public.purchase_bills
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Creator or admin can delete purchase bills" ON public.purchase_bills
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Creator or admin can update purchase bills" ON public.purchase_bills
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Org members can delete purchase items" ON public.purchase_items
  USING ((bill_id IN ( SELECT purchase_bills.id
   FROM purchase_bills
  WHERE (purchase_bills.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can insert purchase items" ON public.purchase_items
  WITH CHECK ((bill_id IN ( SELECT purchase_bills.id
   FROM purchase_bills
  WHERE (purchase_bills.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can update purchase items" ON public.purchase_items
  USING ((bill_id IN ( SELECT purchase_bills.id
   FROM purchase_bills
  WHERE (purchase_bills.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can view purchase items" ON public.purchase_items
  USING ((bill_id IN ( SELECT purchase_bills.id
   FROM purchase_bills
  WHERE (purchase_bills.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can insert vouchers" ON public.voucher_entries
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Creator or admin can delete vouchers" ON public.voucher_entries
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Creator or admin can update vouchers" ON public.voucher_entries
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Users can view vouchers in their organizations" ON public.voucher_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));