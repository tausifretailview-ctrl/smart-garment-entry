-- platform_assign_user_to_org has always been called exactly once in the
-- codebase: from the `create-user` edge function, via a SERVICE_ROLE
-- Supabase client (supabase/functions/create-user/index.ts). Under a
-- service-role call there is no user JWT in the request, so auth.uid()
-- inside this SECURITY DEFINER function is always NULL — meaning
-- `has_role(auth.uid(), 'platform_admin')` was unconditionally false and
-- the function raised "Unauthorized: Only platform admins can assign
-- users" for every caller, including genuine platform admins, even though
-- the edge function had already verified the caller's role from their own
-- JWT before invoking this RPC. This made Platform Admin -> Create User
-- entirely non-functional (the auth.users row got created, then the
-- org-assignment step always failed).
--
-- Fix: accept an explicit p_caller_id, defaulting to auth.uid() so a
-- direct authenticated-client call (if one is ever added) keeps working
-- unchanged. The edge function now passes the JWT-verified caller's id
-- explicitly, so the role check runs against the real caller regardless
-- of which Postgres role executed the RPC.
CREATE OR REPLACE FUNCTION public.platform_assign_user_to_org(
  p_user_email TEXT,
  p_org_id UUID,
  p_role app_role DEFAULT 'user',
  p_caller_id UUID DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Verify caller is platform admin (explicit p_caller_id so this still
  -- works when invoked with a service-role client, which has no auth.uid()).
  IF NOT has_role(p_caller_id, 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can assign users';
  END IF;

  -- Get user ID by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_user_email;
  END IF;

  -- Add to organization
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (p_org_id, v_user_id, p_role)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = p_role;

  -- Add role to user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object(
    'success', true,
    'user_id', v_user_id,
    'org_id', p_org_id,
    'role', p_role
  );
END;
$$;
