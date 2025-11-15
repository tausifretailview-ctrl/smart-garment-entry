-- Fix RLS policies to properly use auth.uid() with SELECT wrapper
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON organizations;
DROP POLICY IF EXISTS "enable_select_for_users" ON organizations;
DROP POLICY IF EXISTS "enable_update_for_admins" ON organizations;

-- Create INSERT policy with proper auth check
CREATE POLICY "enable_insert_for_authenticated_users"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) IS NOT NULL);

-- Create SELECT policy
CREATE POLICY "enable_select_for_users"
ON organizations
FOR SELECT
TO authenticated
USING (id IN (SELECT get_user_organization_ids((select auth.uid()))));

-- Create UPDATE policy  
CREATE POLICY "enable_update_for_admins"
ON organizations
FOR UPDATE
TO authenticated
USING (has_org_role((select auth.uid()), id, 'admin'));