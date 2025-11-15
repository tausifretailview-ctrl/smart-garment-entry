-- Drop ALL existing policies on organizations table
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'organizations' 
      AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', pol.policyname);
  END LOOP;
END $$;

-- Ensure RLS is enabled
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create INSERT policy: any authenticated user can create an organization
CREATE POLICY "authenticated_users_can_insert_organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create SELECT policy: users can view organizations they belong to
CREATE POLICY "users_can_select_their_organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Create UPDATE policy: only admins can update their organizations
CREATE POLICY "admins_can_update_organizations"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_members.organization_id = organizations.id
      AND organization_members.user_id = auth.uid()
      AND organization_members.role = 'admin'
  )
);