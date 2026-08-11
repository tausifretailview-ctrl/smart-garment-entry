ALTER POLICY "Users can update challan items of their organizations" ON public.delivery_challan_items
  USING ((challan_id IN ( SELECT delivery_challans.id
   FROM delivery_challans
  WHERE (delivery_challans.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Users can view challan items of their organizations" ON public.delivery_challan_items
  USING ((challan_id IN ( SELECT delivery_challans.id
   FROM delivery_challans
  WHERE (delivery_challans.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Users can delete delivery challans of their organizations" ON public.delivery_challans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert delivery challans to their organizations" ON public.delivery_challans
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can update delivery challans of their organizations" ON public.delivery_challans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can view delivery challans of their organizations" ON public.delivery_challans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can manage delivery tracking" ON public.delivery_tracking
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view delivery tracking in their organizations" ON public.delivery_tracking
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can create their own drafts" ON public.drafts
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (created_by = (select auth.uid()))));
ALTER POLICY "Users can delete their own drafts" ON public.drafts
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (created_by = (select auth.uid()))));
ALTER POLICY "Users can update their own drafts" ON public.drafts
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (created_by = (select auth.uid()))));
ALTER POLICY "Users can view their own drafts" ON public.drafts
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (created_by = (select auth.uid()))));
ALTER POLICY "Platform admin reads run log" ON public.drift_detection_runs
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Admins and managers can manage employees" ON public.employees
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view employees in their organizations" ON public.employees
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can create expense categories in their organization" ON public.expense_categories
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can delete expense categories in their organization" ON public.expense_categories
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update expense categories in their organization" ON public.expense_categories
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view expense categories in their organization" ON public.expense_categories
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_heads_delete" ON public.fee_heads
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_heads_insert" ON public.fee_heads
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_heads_select" ON public.fee_heads
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_heads_update" ON public.fee_heads
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_fee_receipt_sequence_insert" ON public.fee_receipt_sequence
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_fee_receipt_sequence_select" ON public.fee_receipt_sequence
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_fee_receipt_sequence_update" ON public.fee_receipt_sequence
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_schedules_delete" ON public.fee_schedules
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_schedules_insert" ON public.fee_schedules
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_schedules_select" ON public.fee_schedules
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_schedules_update" ON public.fee_schedules
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert fee structure history" ON public.fee_structure_history
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view fee structure history" ON public.fee_structure_history
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_structures_delete" ON public.fee_structures
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_structures_insert" ON public.fee_structures
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_structures_select" ON public.fee_structures
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_fee_structures_update" ON public.fee_structures
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins can delete gift redemptions" ON public.gift_redemptions
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can create gift redemptions in their organizations" ON public.gift_redemptions
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view gift redemptions in their organizations" ON public.gift_redemptions
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can manage gift rewards" ON public.gift_rewards
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view gift rewards in their organizations" ON public.gift_rewards
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can delete their org templates" ON public.import_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert their org templates" ON public.import_templates
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update their org templates" ON public.import_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view their org templates" ON public.import_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Platform admins read invariant snapshots" ON public.invariant_daily_snapshot
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Org admins can delete invoice_adjustments" ON public.invoice_adjustments
  USING (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org admins can update invoice_adjustments" ON public.invoice_adjustments
  USING (is_org_admin((select auth.uid()), organization_id))
  WITH CHECK (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org members can insert invoice_adjustments" ON public.invoice_adjustments
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view invoice_adjustments" ON public.invoice_adjustments
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org admins can delete journal_entries" ON public.journal_entries
  USING (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org admins can update journal_entries" ON public.journal_entries
  USING (is_org_admin((select auth.uid()), organization_id))
  WITH CHECK (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org members can insert journal_entries" ON public.journal_entries
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view journal_entries" ON public.journal_entries
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org admins can delete journal_lines" ON public.journal_lines
  USING ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.journal_entry_id) AND is_org_admin((select auth.uid()), je.organization_id)))));
ALTER POLICY "Org admins can update journal_lines" ON public.journal_lines
  USING ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.journal_entry_id) AND is_org_admin((select auth.uid()), je.organization_id)))));
ALTER POLICY "Org members can insert journal_lines" ON public.journal_lines
  WITH CHECK ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.journal_entry_id) AND user_belongs_to_org((select auth.uid()), je.organization_id)))));
ALTER POLICY "Org members can view journal_lines" ON public.journal_lines
  USING ((EXISTS ( SELECT 1
   FROM journal_entries je
  WHERE ((je.id = journal_lines.journal_entry_id) AND user_belongs_to_org((select auth.uid()), je.organization_id)))));
ALTER POLICY "Org admins can delete ledger opening balances" ON public.ledger_opening_balances
  USING (((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)) AND (has_role((select auth.uid()), 'platform_admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'admin'::app_role))));
ALTER POLICY "Org admins can update ledger opening balances" ON public.ledger_opening_balances
  USING (((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)) AND (has_role((select auth.uid()), 'platform_admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'admin'::app_role))));
ALTER POLICY "Org members can insert ledger opening balances" ON public.ledger_opening_balances
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view ledger opening balances" ON public.ledger_opening_balances
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can manage legacy invoices" ON public.legacy_invoices
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view legacy invoices in their organizations" ON public.legacy_invoices
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins and managers can insert organization bank accounts" ON public.organization_bank_accounts
  WITH CHECK (((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins and managers can manage bank accounts" ON public.organization_bank_accounts
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Admins and managers can update organization bank accounts" ON public.organization_bank_accounts
  USING (((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK (((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Org members can view bank accounts" ON public.organization_bank_accounts
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view organization bank accounts" ON public.organization_bank_accounts
  USING (((deleted_at IS NULL) AND (organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids))));
ALTER POLICY "Admins can manage label backups" ON public.organization_label_templates_backup
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Organization members can view their label backups" ON public.organization_label_templates_backup
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can view reset audit for their organization" ON public.organization_reset_audit
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "admins_can_update_organizations" ON public.organizations
  USING ((has_role((select auth.uid()), 'platform_admin'::app_role) OR has_org_role((select auth.uid()), id, 'admin'::app_role)))
  WITH CHECK ((has_role((select auth.uid()), 'platform_admin'::app_role) OR has_org_role((select auth.uid()), id, 'admin'::app_role)));