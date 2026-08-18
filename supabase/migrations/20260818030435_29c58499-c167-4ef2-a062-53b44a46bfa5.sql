DROP FUNCTION IF EXISTS public._canary_default_priv_check();

CREATE OR REPLACE FUNCTION public.revoke_public_execute_on_new_functions()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
             WHERE command_tag IN ('CREATE FUNCTION','ALTER FUNCTION')
               AND schema_name = 'public'
  LOOP
    IF obj.objid::regprocedure::text NOT IN (
      'public.get_org_public_info(text)',
      'public.login_attempts_rate_ok(text)'
    ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', obj.objid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', obj.objid::regprocedure);
    END IF;
  END LOOP;
END;
$$;

DROP EVENT TRIGGER IF EXISTS trg_revoke_public_execute_on_new_functions;
CREATE EVENT TRIGGER trg_revoke_public_execute_on_new_functions
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION','ALTER FUNCTION')
  EXECUTE FUNCTION public.revoke_public_execute_on_new_functions();