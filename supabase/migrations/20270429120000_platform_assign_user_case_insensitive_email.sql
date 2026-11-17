-- Platform Admin → Create user: the org-assign step looked the new login up with
-- `auth.users.email = p_user_email`. Auth stores e-mails in lower case, so an address typed
-- with a capital letter found no user, the assign failed, and the login was left with no
-- shop ("Workspace could not be prepared" after sign-in). Match case-insensitively.
-- Same signature as 20261222130000 (the 3-arg overload was dropped in 20261222140000).
-- UNDO: re-run supabase/migrations/20261222130000_fix_platform_assign_user_to_org_service_role.sql

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
  IF NOT has_role(p_caller_id, 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can assign users';
  END IF;

  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_user_email))
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_user_email;
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (p_org_id, v_user_id, p_role)
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET role = p_role;

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
