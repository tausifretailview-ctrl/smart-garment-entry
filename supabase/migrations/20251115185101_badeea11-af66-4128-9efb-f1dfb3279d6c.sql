-- Fix RLS policies for organization creation

-- Drop existing policies that are too restrictive
DROP POLICY IF EXISTS "Admins can manage members in their organization" ON organization_members;
DROP POLICY IF EXISTS "Only admins can manage roles" ON user_roles;

-- Allow users to add themselves as admin when creating an organization
CREATE POLICY "Users can add themselves as organization members"
ON organization_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow admins to manage other members in their organization
CREATE POLICY "Admins can manage members in their organization"
ON organization_members
FOR UPDATE
USING (has_org_role(auth.uid(), organization_id, 'admin'));

CREATE POLICY "Admins can delete members in their organization"
ON organization_members
FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- Allow users to create their own admin role when setting up
CREATE POLICY "Users can create their own roles"
ON user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow admins to manage all roles
CREATE POLICY "Admins can view all roles"
ON user_roles
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
ON user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON user_roles
FOR DELETE
USING (has_role(auth.uid(), 'admin'));