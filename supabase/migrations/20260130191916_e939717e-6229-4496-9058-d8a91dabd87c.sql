-- Fix RLS policy for sale_items to allow updates/edits by organization members
-- Current policy "Only admins can delete sale items" is too restrictive
-- It prevents non-admin users from editing invoices (which requires deleting and re-inserting items)

-- Drop the restrictive delete policy
DROP POLICY IF EXISTS "Only admins can delete sale items" ON sale_items;

-- Create a new policy that allows org members to delete sale items they have access to
-- This checks that the sale belongs to an organization the user is a member of
CREATE POLICY "Organization members can delete sale items" 
ON sale_items 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM sales s
    JOIN organization_members om ON om.organization_id = s.organization_id
    WHERE s.id = sale_items.sale_id
    AND om.user_id = auth.uid()
  )
);