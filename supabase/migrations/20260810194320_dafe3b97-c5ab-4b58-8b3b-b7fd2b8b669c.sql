ALTER POLICY "org_members_academic_years_delete" ON public.academic_years
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_academic_years_insert" ON public.academic_years
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_academic_years_select" ON public.academic_years
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_academic_years_update" ON public.academic_years
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins can manage ledgers" ON public.account_ledgers
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view ledgers in their organizations" ON public.account_ledgers
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert advance attempts" ON public.advance_booking_attempts
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = advance_booking_attempts.organization_id) AND (om.user_id = (select auth.uid()))))));
ALTER POLICY "Org members can view advance attempts" ON public.advance_booking_attempts
  USING ((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = advance_booking_attempts.organization_id) AND (om.user_id = (select auth.uid()))))));
ALTER POLICY "Users can create refunds in their organization" ON public.advance_refunds
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can delete refunds in their organization" ON public.advance_refunds
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view refunds in their organization" ON public.advance_refunds
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "ai_usage_owner_select" ON public.ai_assistant_usage
  USING ((user_id = (select auth.uid())));
ALTER POLICY "authenticated_insert_errors" ON public.app_error_logs
  WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY "org_or_own_select_errors" ON public.app_error_logs
  USING ((((organization_id IS NOT NULL) AND (organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids))) OR (user_id = (select auth.uid()))));
ALTER POLICY "Organization members can view own audit logs" ON public.audit_logs
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can create backup logs for their organization" ON public.backup_logs
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can update their organization's backup logs" ON public.backup_logs
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view their organization's backup logs" ON public.backup_logs
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "org_members_recon_log_select" ON public.balance_reconciliation_log
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can manage barcode settings" ON public.barcode_label_settings
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view barcode settings in their organizations" ON public.barcode_label_settings
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_barcode_sequence_select" ON public.barcode_sequence
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can manage batch stock" ON public.batch_stock
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view batch stock" ON public.batch_stock
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_batch_stock_all" ON public.batch_stock
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can manage bill sequence" ON public.bill_number_sequence
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view bill sequences" ON public.bill_number_sequence
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_bill_sequence_all" ON public.bill_number_sequence
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_bill_sequences" ON public.bill_number_sequences
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert bulk update history for their org" ON public.bulk_update_history
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can view bulk update history for their org" ON public.bulk_update_history
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org admins can delete chart_of_accounts" ON public.chart_of_accounts
  USING (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org members can insert chart_of_accounts" ON public.chart_of_accounts
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can update chart_of_accounts" ON public.chart_of_accounts
  USING (user_belongs_to_org((select auth.uid()), organization_id))
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view chart_of_accounts" ON public.chart_of_accounts
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Admins and managers can manage cheque formats" ON public.cheque_formats
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view cheque formats in their organizations" ON public.cheque_formats
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_commission_rules" ON public.commission_rules
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins and managers can update credit notes" ON public.credit_notes
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete credit notes" ON public.credit_notes
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create credit notes in their organizations" ON public.credit_notes
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view credit notes in their organizations" ON public.credit_notes
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can delete advances" ON public.customer_advances
  USING (((organization_id IN ( SELECT om.organization_id
   FROM organization_members om
  WHERE (om.user_id = (select auth.uid())))) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can insert advances for their organization" ON public.customer_advances
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update advances for their organization" ON public.customer_advances
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view advances for their organization" ON public.customer_advances
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can delete adjustments" ON public.customer_balance_adjustments
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can insert adjustments" ON public.customer_balance_adjustments
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can update adjustments" ON public.customer_balance_adjustments
  USING (user_belongs_to_org((select auth.uid()), organization_id))
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view adjustments" ON public.customer_balance_adjustments
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can delete brand discounts in their org" ON public.customer_brand_discounts
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert brand discounts in their org" ON public.customer_brand_discounts
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can update brand discounts in their org" ON public.customer_brand_discounts
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can view brand discounts in their org" ON public.customer_brand_discounts
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete customer ledger entries" ON public.customer_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert customer ledger entries" ON public.customer_ledger_entries
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can update customer ledger entries" ON public.customer_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view customer ledger entries" ON public.customer_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can update points history" ON public.customer_points_history
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins can delete points history" ON public.customer_points_history
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create points history in their organizations" ON public.customer_points_history
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view points history in their organizations" ON public.customer_points_history
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can delete customer prices in their organization" ON public.customer_product_prices
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can insert customer prices in their organization" ON public.customer_product_prices
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can update customer prices in their organization" ON public.customer_product_prices
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view customer prices in their organization" ON public.customer_product_prices
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can delete daily tally snapshots for their org" ON public.daily_tally_snapshot
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can insert daily tally snapshots for their org" ON public.daily_tally_snapshot
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can update daily tally snapshots for their org" ON public.daily_tally_snapshot
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view daily tally snapshots for their org" ON public.daily_tally_snapshot
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can manage dc_sale_transfers in their org" ON public.dc_sale_transfers
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))))
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can delete challan items of their organizations" ON public.delivery_challan_items
  USING ((challan_id IN ( SELECT delivery_challans.id
   FROM delivery_challans
  WHERE (delivery_challans.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Users can insert challan items to their organizations" ON public.delivery_challan_items
  WITH CHECK ((challan_id IN ( SELECT delivery_challans.id
   FROM delivery_challans
  WHERE (delivery_challans.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));