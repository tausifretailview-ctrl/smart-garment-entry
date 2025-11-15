-- Fix organization_members and user_roles policies to use (select auth.uid())
DROP POLICY IF EXISTS "Users can add themselves as organization members" ON organization_members;
DROP POLICY IF EXISTS "Users can create their own roles" ON user_roles;
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

-- Fix organization_members INSERT policy
CREATE POLICY "Users can add themselves as organization members"
ON organization_members
FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);

-- Fix organization_members SELECT policy
CREATE POLICY "Users can view members of their organizations"
ON organization_members
FOR SELECT
TO authenticated
USING (organization_id IN (SELECT get_user_organization_ids((select auth.uid()))));

-- Fix user_roles INSERT policy
CREATE POLICY "Users can create their own roles"
ON user_roles
FOR INSERT
WITH CHECK ((select auth.uid()) = user_id);