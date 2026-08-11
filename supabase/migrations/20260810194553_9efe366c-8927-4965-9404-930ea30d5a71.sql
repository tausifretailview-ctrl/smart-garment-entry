ALTER POLICY "platform_admins_can_create_organizations" ON public.organizations
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "platform_admins_can_delete_organizations" ON public.organizations
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "users_can_select_their_organizations" ON public.organizations
  USING ((has_role((select auth.uid()), 'platform_admin'::app_role) OR (id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid()))))));
ALTER POLICY "Admins and managers can view gateway settings" ON public.payment_gateway_settings
  USING ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)));
ALTER POLICY "Admins can manage gateway settings" ON public.payment_gateway_settings
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create payment links in their organizations" ON public.payment_links
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can update payment links in their organizations" ON public.payment_links
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can view payment links in their organizations" ON public.payment_links
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Platform admins can modify platform settings" ON public.platform_settings
  USING (has_role((select auth.uid()), 'platform_admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Platform admins can view platform settings" ON public.platform_settings
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Users can delete org presets" ON public.printer_presets
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert org presets" ON public.printer_presets
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update org presets" ON public.printer_presets
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view org presets" ON public.printer_presets
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can insert printer preset backups" ON public.printer_presets_backup
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can view printer preset backups" ON public.printer_presets_backup
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can delete product images for their organization" ON public.product_images
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert product images for their organization" ON public.product_images
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update product images for their organization" ON public.product_images
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view product images for their organization" ON public.product_images
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert promotion history for their org" ON public.promotion_history
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view promotion history for their org" ON public.promotion_history
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins and managers can delete purchase order items" ON public.purchase_order_items
  USING ((order_id IN ( SELECT po.id
   FROM purchase_orders po
  WHERE ((po.organization_id IN ( SELECT om.organization_id
           FROM organization_members om
          WHERE (om.user_id = (select auth.uid())))) AND (has_org_role((select auth.uid()), po.organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), po.organization_id, 'manager'::app_role))))));
ALTER POLICY "Users can create purchase order items" ON public.purchase_order_items
  WITH CHECK ((order_id IN ( SELECT purchase_orders.id
   FROM purchase_orders
  WHERE (purchase_orders.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))));
ALTER POLICY "Users can update purchase order items" ON public.purchase_order_items
  USING ((order_id IN ( SELECT purchase_orders.id
   FROM purchase_orders
  WHERE (purchase_orders.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))));
ALTER POLICY "Users can view purchase order items" ON public.purchase_order_items
  USING ((order_id IN ( SELECT purchase_orders.id
   FROM purchase_orders
  WHERE (purchase_orders.organization_id IN ( SELECT organization_members.organization_id
           FROM organization_members
          WHERE (organization_members.user_id = (select auth.uid())))))));
ALTER POLICY "Admins and managers can delete purchase orders" ON public.purchase_orders
  USING (((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can create purchase orders in their organization" ON public.purchase_orders
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update purchase orders in their organization" ON public.purchase_orders
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view purchase orders in their organization" ON public.purchase_orders
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can delete purchase return items" ON public.purchase_return_items
  USING ((return_id IN ( SELECT purchase_returns.id
   FROM purchase_returns
  WHERE (purchase_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can insert purchase return items" ON public.purchase_return_items
  WITH CHECK ((return_id IN ( SELECT purchase_returns.id
   FROM purchase_returns
  WHERE (purchase_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can update purchase return items" ON public.purchase_return_items
  USING ((return_id IN ( SELECT purchase_returns.id
   FROM purchase_returns
  WHERE (purchase_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can view purchase return items" ON public.purchase_return_items
  USING ((return_id IN ( SELECT purchase_returns.id
   FROM purchase_returns
  WHERE (purchase_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Users can view return items in their organizations" ON public.purchase_return_items
  USING ((return_id IN ( SELECT purchase_returns.id
   FROM purchase_returns
  WHERE (purchase_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can manage returns" ON public.purchase_returns
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view returns in their organizations" ON public.purchase_returns
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete quotation items" ON public.quotation_items
  USING ((quotation_id IN ( SELECT quotations.id
   FROM quotations
  WHERE (quotations.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can insert quotation items" ON public.quotation_items
  WITH CHECK ((quotation_id IN ( SELECT quotations.id
   FROM quotations
  WHERE (quotations.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can update quotation items" ON public.quotation_items
  USING ((quotation_id IN ( SELECT quotations.id
   FROM quotations
  WHERE (quotations.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can view quotation items" ON public.quotation_items
  USING ((quotation_id IN ( SELECT quotations.id
   FROM quotations
  WHERE (quotations.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can update quotations" ON public.quotations
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete quotations" ON public.quotations
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create quotations in their organizations" ON public.quotations
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view quotations in their organizations" ON public.quotations
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete financer details" ON public.sale_financer_details
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert financer details" ON public.sale_financer_details
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can update financer details" ON public.sale_financer_details
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view financer details" ON public.sale_financer_details
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_sale_number_sequence_all" ON public.sale_number_sequence
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete sale order items" ON public.sale_order_items
  USING ((order_id IN ( SELECT sale_orders.id
   FROM sale_orders
  WHERE (sale_orders.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can insert sale order items" ON public.sale_order_items
  WITH CHECK ((order_id IN ( SELECT sale_orders.id
   FROM sale_orders
  WHERE (sale_orders.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can update sale order items" ON public.sale_order_items
  USING ((order_id IN ( SELECT sale_orders.id
   FROM sale_orders
  WHERE (sale_orders.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Org members can view sale order items" ON public.sale_order_items
  USING ((order_id IN ( SELECT sale_orders.id
   FROM sale_orders
  WHERE (sale_orders.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can update sale orders" ON public.sale_orders
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete sale orders" ON public.sale_orders
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create sale orders in their organizations" ON public.sale_orders
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view sale orders in their organizations" ON public.sale_orders
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete sr allocations" ON public.sale_return_invoice_allocations
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can insert sr allocations" ON public.sale_return_invoice_allocations
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can update sr allocations" ON public.sale_return_invoice_allocations
  USING (user_belongs_to_org((select auth.uid()), organization_id))
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view sr allocations" ON public.sale_return_invoice_allocations
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Admins and managers can manage return items" ON public.sale_return_items
  USING ((return_id IN ( SELECT sr.id
   FROM sale_returns sr
  WHERE (user_belongs_to_org((select auth.uid()), sr.organization_id) AND (has_org_role((select auth.uid()), sr.organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), sr.organization_id, 'manager'::app_role))))))
  WITH CHECK ((return_id IN ( SELECT sr.id
   FROM sale_returns sr
  WHERE (user_belongs_to_org((select auth.uid()), sr.organization_id) AND (has_org_role((select auth.uid()), sr.organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), sr.organization_id, 'manager'::app_role))))));
ALTER POLICY "Users can view return items in their organizations" ON public.sale_return_items
  USING ((return_id IN ( SELECT sale_returns.id
   FROM sale_returns
  WHERE (sale_returns.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can insert returns" ON public.sale_returns
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins and managers can update returns" ON public.sale_returns
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete returns" ON public.sale_returns
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view returns in their organizations" ON public.sale_returns
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_salesman_commissions" ON public.salesman_commissions
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_school_classes_delete" ON public.school_classes
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_school_classes_insert" ON public.school_classes
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_school_classes_select" ON public.school_classes
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_school_classes_update" ON public.school_classes
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));