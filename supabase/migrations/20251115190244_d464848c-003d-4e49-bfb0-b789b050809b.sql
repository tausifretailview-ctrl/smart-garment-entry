-- Drop all existing policies on organizations
DROP POLICY IF EXISTS "Allow authenticated users to create organizations" ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;
DROP POLICY IF EXISTS "Anyone can create organizations" ON organizations;

-- Create a simple policy that allows any authenticated user to insert
CREATE POLICY "enable_insert_for_authenticated_users"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Verify the SELECT policy exists
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;

CREATE POLICY "enable_select_for_users"
ON organizations
FOR SELECT
TO authenticated
USING (id IN (SELECT get_user_organization_ids(auth.uid())));

-- Verify the UPDATE policy exists
DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;

CREATE POLICY "enable_update_for_admins"
ON organizations
FOR UPDATE
TO authenticated
USING (has_org_role(auth.uid(), id, 'admin'));