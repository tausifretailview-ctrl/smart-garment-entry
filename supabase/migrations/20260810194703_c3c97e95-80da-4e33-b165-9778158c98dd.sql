ALTER POLICY "Admins can manage settings" ON public.settings
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view settings in their organizations" ON public.settings
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "platform_admins_can_view_all_settings" ON public.settings
  USING ((has_role((select auth.uid()), 'platform_admin'::app_role) OR (organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids))));
ALTER POLICY "Org members read own drift" ON public.settlement_drift_log
  USING (((EXISTS ( SELECT 1
   FROM organization_members om
  WHERE ((om.organization_id = settlement_drift_log.organization_id) AND (om.user_id = (select auth.uid()))))) OR has_role((select auth.uid()), 'platform_admin'::app_role)));
ALTER POLICY "Platform admin resolves drift" ON public.settlement_drift_log
  USING (has_role((select auth.uid()), 'platform_admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Admins and managers can manage size groups" ON public.size_groups
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view size groups in their organizations" ON public.size_groups
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can create SMS logs in their organizations" ON public.sms_logs
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view SMS logs in their organizations" ON public.sms_logs
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins can manage SMS settings" ON public.sms_settings
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view SMS settings in their organizations" ON public.sms_settings
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Admins can manage SMS templates" ON public.sms_templates
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view SMS templates in their organizations" ON public.sms_templates
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can view stock alerts for their organizations" ON public.stock_alerts
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can insert stock movements" ON public.stock_movements
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view stock movements" ON public.stock_movements
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert stock movements in their organizations" ON public.stock_movements
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can delete stock settlement scans" ON public.stock_settlement_scans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert stock settlement scans" ON public.stock_settlement_scans
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can update stock settlement scans" ON public.stock_settlement_scans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view stock settlement scans" ON public.stock_settlement_scans
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view stock settlement zero items" ON public.stock_settlement_zero_items
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view stock settlement zero runs" ON public.stock_settlement_zero_runs
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_student_balance_audit" ON public.student_balance_audit
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_student_fees_delete" ON public.student_fees
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_student_fees_insert" ON public.student_fees
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_student_fees_select" ON public.student_fees
  USING (((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))) OR (student_id IN ( SELECT students.id
   FROM students
  WHERE (students.user_id = (select auth.uid()))))));
ALTER POLICY "org_members_student_fees_update" ON public.student_fees
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Org members can delete student ledger entries" ON public.student_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can insert student ledger entries" ON public.student_ledger_entries
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can update student ledger entries" ON public.student_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view student ledger entries" ON public.student_ledger_entries
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_members_students_delete" ON public.students
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_students_insert" ON public.students
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_students_select" ON public.students
  USING (((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))) OR (user_id = (select auth.uid()))));
ALTER POLICY "org_members_students_update" ON public.students
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins and managers can manage suppliers" ON public.suppliers
  USING ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))))
  WITH CHECK ((user_belongs_to_org((select auth.uid()), organization_id) AND (has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role))));
ALTER POLICY "Users can view suppliers in their organizations" ON public.suppliers
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "org_members_teachers_delete" ON public.teachers
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_teachers_insert" ON public.teachers
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "org_members_teachers_select" ON public.teachers
  USING (((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))) OR (user_id = (select auth.uid()))));
ALTER POLICY "org_members_teachers_update" ON public.teachers
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins can manage user permissions" ON public.user_permissions
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view their own permissions" ON public.user_permissions
  USING ((user_id = (select auth.uid())));
ALTER POLICY "Admins and managers can manage voucher items" ON public.voucher_items
  USING ((voucher_id IN ( SELECT ve.id
   FROM voucher_entries ve
  WHERE (user_belongs_to_org((select auth.uid()), ve.organization_id) AND (has_org_role((select auth.uid()), ve.organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), ve.organization_id, 'manager'::app_role))))))
  WITH CHECK ((voucher_id IN ( SELECT ve.id
   FROM voucher_entries ve
  WHERE (user_belongs_to_org((select auth.uid()), ve.organization_id) AND (has_org_role((select auth.uid()), ve.organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), ve.organization_id, 'manager'::app_role))))));
ALTER POLICY "Users can view voucher items in their organizations" ON public.voucher_items
  USING ((voucher_id IN ( SELECT voucher_entries.id
   FROM voucher_entries
  WHERE (voucher_entries.organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))));
ALTER POLICY "Admins and managers can delete whatsapp settings" ON public.whatsapp_api_settings
  USING ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)));
ALTER POLICY "Admins and managers can insert whatsapp settings" ON public.whatsapp_api_settings
  WITH CHECK ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)));
ALTER POLICY "Admins and managers can update whatsapp settings" ON public.whatsapp_api_settings
  USING ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)))
  WITH CHECK ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)));
ALTER POLICY "Admins and managers can view whatsapp settings" ON public.whatsapp_api_settings
  USING ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) OR has_org_role((select auth.uid()), organization_id, 'manager'::app_role)));
ALTER POLICY "Org members can manage conversations" ON public.whatsapp_conversations
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view conversations" ON public.whatsapp_conversations
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert conversations for their organization" ON public.whatsapp_conversations
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update conversations for their organization" ON public.whatsapp_conversations
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view conversations for their organization" ON public.whatsapp_conversations
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Platform admins can view all whatsapp logs" ON public.whatsapp_logs
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Users can insert their organization whatsapp logs" ON public.whatsapp_logs
  WITH CHECK (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can update their organization whatsapp logs" ON public.whatsapp_logs
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Users can view their organization whatsapp logs" ON public.whatsapp_logs
  USING (user_belongs_to_org((select auth.uid()), organization_id));
ALTER POLICY "Org members can view own WhatsApp stats" ON public.whatsapp_message_stats
  USING ((EXISTS ( SELECT 1
   FROM organization_members
  WHERE ((organization_members.user_id = (select auth.uid())) AND (organization_members.organization_id = whatsapp_message_stats.organization_id)))));
ALTER POLICY "Platform admins can view all WhatsApp stats" ON public.whatsapp_message_stats
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = (select auth.uid())) AND (user_roles.role = 'platform_admin'::app_role)))));
ALTER POLICY "Org members can manage messages" ON public.whatsapp_messages
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)))
  WITH CHECK ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Org members can view messages" ON public.whatsapp_messages
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));
ALTER POLICY "Users can insert messages for their organization" ON public.whatsapp_messages
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update messages for their organization" ON public.whatsapp_messages
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view messages for their organization" ON public.whatsapp_messages
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can delete their organization meta templates" ON public.whatsapp_meta_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can insert their organization meta templates" ON public.whatsapp_meta_templates
  WITH CHECK ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can update their organization meta templates" ON public.whatsapp_meta_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Users can view their organization meta templates" ON public.whatsapp_meta_templates
  USING ((organization_id IN ( SELECT organization_members.organization_id
   FROM organization_members
  WHERE (organization_members.user_id = (select auth.uid())))));
ALTER POLICY "Admins can manage templates" ON public.whatsapp_templates
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Users can view templates in their organizations" ON public.whatsapp_templates
  USING ((organization_id IN ( SELECT get_user_organization_ids((select auth.uid())) AS get_user_organization_ids)));