-- Recent successful-login history for Organization Management → Activity.
-- Reads existing audit_logs (action = 'LOGIN'). Client insert at org sign-in
-- needs a narrow INSERT policy: audit_logs is otherwise append-only via
-- SECURITY DEFINER writers (triggers / log_audit / service role).

CREATE OR REPLACE FUNCTION public.get_organization_login_history(
  p_org_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  user_email text,
  logged_in_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT al.user_email, al.created_at
  FROM public.audit_logs al
  WHERE al.organization_id = p_org_id
    AND al.action = 'LOGIN'
  ORDER BY al.created_at DESC
  -- COALESCE/GREATEST keep LIMIT from becoming NULL (unbounded) if p_limit is null/negative.
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
END;
$$;

COMMENT ON FUNCTION public.get_organization_login_history(uuid, integer) IS
  'Org-scoped recent LOGIN rows from audit_logs. SECURITY DEFINER, fail-closed auth.role() guard, hard cap 200.';

REVOKE ALL ON FUNCTION public.get_organization_login_history(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_organization_login_history(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_organization_login_history(uuid, integer) TO authenticated, service_role;

DROP POLICY IF EXISTS "Members can insert own LOGIN audit rows" ON public.audit_logs;
CREATE POLICY "Members can insert own LOGIN audit rows"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  action = 'LOGIN'
  AND entity_type = 'auth'
  AND user_id IS NOT NULL
  AND user_id = (SELECT auth.uid())
  AND organization_id IS NOT NULL
  AND organization_id IN (SELECT public.get_user_organization_ids((SELECT auth.uid())))
);

GRANT INSERT ON TABLE public.audit_logs TO authenticated;
