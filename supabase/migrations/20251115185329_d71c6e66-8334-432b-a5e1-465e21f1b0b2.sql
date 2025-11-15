-- Fix organizations table RLS policy for creation

-- Drop the existing policy
DROP POLICY IF EXISTS "Anyone can create organizations" ON organizations;

-- Create a simpler policy that allows authenticated users to create organizations
CREATE POLICY "Authenticated users can create organizations"
ON organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Ensure the SELECT policy allows users to see their organizations
DROP POLICY IF EXISTS "Users can view their organizations" ON organizations;

CREATE POLICY "Users can view their organizations"
ON organizations
FOR SELECT
TO authenticated
USING (id IN (SELECT get_user_organization_ids(auth.uid())));

-- Ensure the UPDATE policy is correct
DROP POLICY IF EXISTS "Admins can update their organization" ON organizations;

CREATE POLICY "Admins can update their organization"
ON organizations
FOR UPDATE
TO authenticated
USING (has_org_role(auth.uid(), id, 'admin'));

-- Fix organization_members SELECT policy to use TO authenticated
DROP POLICY IF EXISTS "Users can view members of their organizations" ON organization_members;

CREATE POLICY "Users can view members of their organizations"
ON organization_members
FOR SELECT
TO authenticated
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));