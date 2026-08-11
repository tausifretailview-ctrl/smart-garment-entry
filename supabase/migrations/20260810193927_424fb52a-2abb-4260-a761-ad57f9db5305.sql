ALTER POLICY "Admins and managers can manage variants" ON public.product_variants
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view variants in their organizations" ON public.product_variants
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_variants_select" ON public.product_variants
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can insert products" ON public.products
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins and managers can update products" ON public.products
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete products" ON public.products
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view products in their organizations" ON public.products
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_products_select" ON public.products
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert sale items" ON public.sale_items
  WITH CHECK ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can update sale items" ON public.sale_items
  USING ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can view sale items" ON public.sale_items
  USING ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Organization members can delete sale items" ON public.sale_items
  USING ((EXISTS ( SELECT 1
   FROM (sales s
     JOIN organization_members om ON ((om.organization_id = s.organization_id)))
  WHERE ((s.id = sale_items.sale_id) AND (om.user_id = (select auth.uid()))))));
ALTER POLICY "org_sale_items_select" ON public.sale_items
  USING ((sale_id IN ( SELECT sales.id
   FROM sales
  WHERE (sales.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Creator or admin can delete sales" ON public.sales
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Creator or admin can update sales" ON public.sales
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND is_entry_creator_or_admin(organization_id, created_by)))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND is_entry_creator_or_admin(organization_id, created_by)));
ALTER POLICY "Users can create sales in their organizations" ON public.sales
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view sales in their organizations" ON public.sales
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));