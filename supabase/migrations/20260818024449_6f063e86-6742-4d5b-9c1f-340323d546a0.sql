-- Security: remove anonymous EXECUTE on writing SECURITY DEFINER functions in public.
-- Confirmed exploitable: an unauthenticated POST to /rest/v1/rpc/get_low_stock_alerts with
-- only the publishable key returned live rows, because org guards are written as
-- "IF auth.uid() IS NOT NULL THEN ...check... END IF" (fail-open for anon) and
-- SECURITY DEFINER bypasses RLS.
-- The privilege is held via PUBLIC, so REVOKE ... FROM anon alone would be a silent no-op.
DO $$
DECLARE
  r record;
  n_revoked int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig,
           (pg_get_function_result(p.oid) = 'trigger') AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND p.provolatile = 'v'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      -- allowlist: nothing volatile is called by an unauthenticated screen today.
      -- get_org_public_info (org branding on the login page) is STABLE and untouched here.
    ORDER BY 1
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    IF NOT r.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;
    n_revoked := n_revoked + 1;
  END LOOP;
  RAISE NOTICE 'anon EXECUTE removed from % volatile SECURITY DEFINER functions', n_revoked;
END $$;

-- Stop the hole reappearing: Postgres grants EXECUTE to PUBLIC on every new function.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;