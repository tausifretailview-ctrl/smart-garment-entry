-- Fix organizations INSERT policy with explicit auth check

-- Drop the existing INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON organizations;

-- Create a new policy that explicitly checks for authenticated user
CREATE POLICY "Allow authenticated users to create organizations"
ON organizations
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);