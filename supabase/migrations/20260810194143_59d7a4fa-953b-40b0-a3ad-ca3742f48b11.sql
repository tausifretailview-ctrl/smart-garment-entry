ALTER POLICY "Admins can delete members in their organization" ON public.organization_members
  USING (has_org_role((select auth.uid()), organization_id, 'admin'::app_role));
ALTER POLICY "Admins can manage members in their organization" ON public.organization_members
  USING ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) AND (user_id <> (select auth.uid()))))
  WITH CHECK ((has_org_role((select auth.uid()), organization_id, 'admin'::app_role) AND (user_id <> (select auth.uid()))));
ALTER POLICY "Org admins can delete members" ON public.organization_members
  USING (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org admins can insert members" ON public.organization_members
  WITH CHECK (is_org_admin((select auth.uid()), organization_id));
ALTER POLICY "Org admins can update members" ON public.organization_members
  USING ((is_org_admin((select auth.uid()), organization_id) AND (user_id <> (select auth.uid()))))
  WITH CHECK ((is_org_admin((select auth.uid()), organization_id) AND (user_id <> (select auth.uid()))));
ALTER POLICY "platform_admins_can_delete_members" ON public.organization_members
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "platform_admins_can_manage_all_members" ON public.organization_members
  USING (has_role((select auth.uid()), 'platform_admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "platform_admins_can_update_member_roles" ON public.organization_members
  USING (has_role((select auth.uid()), 'platform_admin'::app_role))
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Platform admins can delete roles" ON public.user_roles
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Platform admins can insert roles" ON public.user_roles
  WITH CHECK (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "Platform admins can update roles" ON public.user_roles
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "platform_admins_can_view_all_roles" ON public.user_roles
  USING (has_role((select auth.uid()), 'platform_admin'::app_role));
ALTER POLICY "users_can_view_own_roles" ON public.user_roles
  USING ((user_id = (select auth.uid())));