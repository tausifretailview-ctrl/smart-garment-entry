-- Allow platform_admins to delete organizations
DROP POLICY IF EXISTS "platform_admins_can_delete_organizations" ON public.organizations;
CREATE POLICY "platform_admins_can_delete_organizations"
ON public.organizations
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'platform_admin'::app_role));

-- Ensure platform_admins can delete organization_members
DROP POLICY IF EXISTS "platform_admins_can_delete_members" ON public.organization_members;
CREATE POLICY "platform_admins_can_delete_members"
ON public.organization_members
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'platform_admin'::app_role));

-- Ensure platform_admins can update organization_members roles
DROP POLICY IF EXISTS "platform_admins_can_update_member_roles" ON public.organization_members;
CREATE POLICY "platform_admins_can_update_member_roles"
ON public.organization_members
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));