-- Fix 1: Remove the overly permissive public SELECT policy on settings table
-- that exposes API credentials, WhatsApp tokens, and payment gateway secrets to anonymous users
DROP POLICY IF EXISTS "Public can view settings for invoice display" ON public.settings;

-- Fix 2: Fix audit logs organization isolation
-- Drop the current policy that allows cross-organization access
DROP POLICY IF EXISTS "Admins and managers can view audit logs" ON public.audit_logs;

-- Create organization-scoped audit logs policy
CREATE POLICY "Organization members can view own audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);