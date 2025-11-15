-- Temporarily disable RLS to test if that's the issue
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "enable_insert_for_authenticated_users" ON organizations;
DROP POLICY IF EXISTS "enable_select_for_users" ON organizations;
DROP POLICY IF EXISTS "enable_update_for_admins" ON organizations;

-- Create the simplest possible INSERT policy for authenticated users
CREATE POLICY "organizations_insert_policy"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create SELECT policy
CREATE POLICY "organizations_select_policy"
ON organizations
FOR SELECT  
TO authenticated
USING (id IN (SELECT get_user_organization_ids((select auth.uid()))));

-- Create UPDATE policy
CREATE POLICY "organizations_update_policy"
ON organizations
FOR UPDATE
TO authenticated
USING (has_org_role((select auth.uid()), id, 'admin'));