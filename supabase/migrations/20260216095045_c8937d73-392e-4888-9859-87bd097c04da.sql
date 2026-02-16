
-- ============================================================
-- SECURITY HARDENING MIGRATION
-- Fixes Issues 1-7 from the security audit
-- NO DATA IS DELETED OR MODIFIED - only policies and schema
-- ============================================================

-- ========== ISSUE 1 & 2: Remove public sales/settings/sale_items policies ==========

-- Drop the overly permissive public SELECT policies
DROP POLICY IF EXISTS "Public can view sales by id for invoice sharing" ON public.sales;
DROP POLICY IF EXISTS "Public can view sale items for invoices" ON public.sale_items;
DROP POLICY IF EXISTS "Public can view settings for invoice display" ON public.settings;

-- ========== ISSUE 3: Replace blanket organizations policy ==========

DROP POLICY IF EXISTS "Anyone can view organization by slug" ON public.organizations;

-- Create a secure RPC function that returns only safe org fields
CREATE OR REPLACE FUNCTION public.get_org_public_info(p_slug text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    'settings', o.settings,
    'business_name', s.business_name,
    'bill_barcode_settings', s.bill_barcode_settings
  )
  FROM organizations o
  LEFT JOIN settings s ON s.organization_id = o.id
  WHERE o.slug = p_slug
  LIMIT 1;
$$;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO authenticated;

-- ========== ISSUE 4: Audit Log Protection ==========

-- Add organization_id column to audit_logs (nullable for backward compat)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
  END IF;
END
$$;

-- Explicitly deny DELETE on audit_logs for all users (append-only)
DROP POLICY IF EXISTS "No one can delete audit logs" ON public.audit_logs;
CREATE POLICY "No one can delete audit logs"
ON public.audit_logs
FOR DELETE
TO authenticated
USING (false);

-- Explicitly deny UPDATE on audit_logs for all users (immutable)
DROP POLICY IF EXISTS "No one can update audit logs" ON public.audit_logs;
CREATE POLICY "No one can update audit logs"
ON public.audit_logs
FOR UPDATE
TO authenticated
USING (false);

-- ========== ISSUE 5: Login Attempts Bypass ==========

-- Drop the overly permissive ALL policy
DROP POLICY IF EXISTS "Authenticated users can manage login attempts" ON public.login_attempts;

-- Only allow anon to INSERT (for recording failed attempts)
DROP POLICY IF EXISTS "Anon can insert login attempts" ON public.login_attempts;
CREATE POLICY "Anon can insert login attempts"
ON public.login_attempts
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anon to SELECT (to check attempt counts)
DROP POLICY IF EXISTS "Anon can read login attempts" ON public.login_attempts;
CREATE POLICY "Anon can read login attempts"
ON public.login_attempts
FOR SELECT
TO anon
USING (true);

-- Allow anon to UPDATE (to increment counters)
DROP POLICY IF EXISTS "Anon can update login attempts" ON public.login_attempts;
CREATE POLICY "Anon can update login attempts"
ON public.login_attempts
FOR UPDATE
TO anon
USING (true);

-- ========== ISSUE 6: Function Search Path ==========

-- Fix generate_next_barcode search path
ALTER FUNCTION public.generate_next_barcode(uuid) SET search_path = 'public';

-- ========== ISSUE 7: Organizations INSERT ==========

-- Drop the permissive insert policy (platform_admins policy remains)
DROP POLICY IF EXISTS "authenticated_users_can_insert_organizations" ON public.organizations;

-- Update log_audit function to accept organization_id
CREATE OR REPLACE FUNCTION public.log_audit(
  p_action text, 
  p_entity_type text, 
  p_entity_id uuid DEFAULT NULL, 
  p_old_values jsonb DEFAULT NULL, 
  p_new_values jsonb DEFAULT NULL, 
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_log_id UUID;
  v_user_email TEXT;
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = auth.uid();
  END IF;

  -- Try to extract organization_id from metadata
  IF p_metadata IS NOT NULL AND p_metadata ? 'organization_id' THEN
    v_org_id := (p_metadata->>'organization_id')::uuid;
  ELSE
    -- Try to get org from user's membership (first org)
    SELECT organization_id INTO v_org_id
    FROM public.organization_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  INSERT INTO public.audit_logs (
    user_id,
    user_email,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata,
    organization_id
  ) VALUES (
    auth.uid(),
    v_user_email,
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    p_metadata,
    v_org_id
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Update log_security_event to use organization_id column
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text, 
  p_user_id uuid, 
  p_organization_id uuid, 
  p_details jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id,
    action, 
    entity_type, 
    entity_id, 
    user_id,
    new_values,
    metadata
  ) VALUES (
    p_organization_id,
    'SECURITY_EVENT',
    p_event_type,
    COALESCE(p_user_id::text, 'anonymous'),
    p_user_id,
    p_details,
    jsonb_build_object('timestamp', now())
  );
END;
$$;
