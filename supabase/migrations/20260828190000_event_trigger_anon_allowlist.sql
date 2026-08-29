-- P0 SECURITY: restore the full anon-callable allowlist on the auto-revoke event trigger.
--
-- BACKGROUND
-- `trg_revoke_public_execute_on_new_functions` fires on every CREATE/ALTER FUNCTION in
-- `public` and strips EXECUTE from PUBLIC/anon. The version installed by
-- 20261030120000_public_storefront_phase1.sql allowlists only 3 functions
-- (get_org_public_info, login_attempts_rate_ok, get_public_storefront), down from the
-- original 8. The six missing entries are RLS helper functions that anon MUST be able to
-- execute, otherwise anon-visible RLS policies error instead of returning zero rows:
--
--   has_role, has_org_role, is_org_admin, is_entry_creator_or_admin,
--   user_belongs_to_org, get_user_organization_ids
--
-- Today they still work only because nothing has replaced them since the trigger was
-- narrowed. The next unrelated migration that does `CREATE OR REPLACE FUNCTION
-- has_org_role(...)` would silently strip their anon grant and break authorization
-- app-wide, with no error pointing at the cause.
--
-- LATENT BUG ALSO FIXED HERE
-- The previous allowlist compared `obj.objid::regprocedure::text` against values written
-- as 'public.get_org_public_info(text)'. Because the trigger function runs with
-- `SET search_path = public`, regprocedure renders functions in `public` WITHOUT the
-- schema prefix (i.e. 'get_org_public_info(text)'), so those entries could never match
-- and the allowlist was effectively a no-op. Those functions kept anon access only
-- because their own migrations re-GRANT anon after the CREATE. This migration matches on
-- `proname` instead, which is immune to both schema-qualification rendering and to
-- argument-signature drift across overloads.
--
-- SELF-HEALING
-- For allowlisted functions the trigger now explicitly (re)grants EXECUTE to anon rather
-- than merely skipping the revoke. CREATE OR REPLACE preserves ACLs, but DROP + CREATE
-- resets them; granting explicitly makes the intended end state guaranteed either way.
-- PUBLIC stays revoked everywhere - anon is granted by name, never via PUBLIC.
--
-- ESCAPE HATCH (documented on purpose - see checklist item 1)
-- If this trigger ever blocks a legitimate migration, disable it, run the migration, and
-- re-enable it:
--
--     ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions DISABLE;
--     -- ... run the blocked DDL ...
--     ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions ENABLE;
--
-- Leaving it disabled re-opens the anon hole closed on 18 Aug 2026, so re-enabling is
-- mandatory, not optional.

CREATE OR REPLACE FUNCTION public.revoke_public_execute_on_new_functions()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obj record;
  -- Functions that must remain callable by the anon role.
  --   get_org_public_info / login_attempts_rate_ok  -> org login page
  --   get_public_storefront / submit_public_storefront_enquiry -> public storefront
  --   has_role .. get_user_organization_ids         -> RLS guard helpers
  anon_allowlist CONSTANT text[] := ARRAY[
    'get_org_public_info',
    'login_attempts_rate_ok',
    'get_public_storefront',
    'submit_public_storefront_enquiry',
    'has_role',
    'has_org_role',
    'is_org_admin',
    'is_entry_creator_or_admin',
    'user_belongs_to_org',
    'get_user_organization_ids'
  ];
BEGIN
  FOR obj IN
    SELECT ddl.objid, p.proname
    FROM pg_event_trigger_ddl_commands() ddl
    JOIN pg_proc p ON p.oid = ddl.objid
    WHERE ddl.command_tag IN ('CREATE FUNCTION', 'ALTER FUNCTION')
      AND ddl.schema_name = 'public'
  LOOP
    IF obj.proname = ANY (anon_allowlist) THEN
      -- Allowlisted: keep PUBLIC revoked, but grant anon explicitly by name so the
      -- intended state survives DROP + CREATE (which resets ACLs), not just REPLACE.
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;',
        obj.objid::regprocedure
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role;',
        obj.objid::regprocedure
      );
      RAISE NOTICE 'anon allowlist retained for %', obj.objid::regprocedure;
    ELSE
      -- Unchanged from the behaviour installed on 18 Aug 2026.
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;',
        obj.objid::regprocedure
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;',
        obj.objid::regprocedure
      );
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.revoke_public_execute_on_new_functions() IS
  'Event-trigger body: revokes EXECUTE from PUBLIC/anon on every new or replaced public function, except the anon allowlist (org login, public storefront, RLS guard helpers), which is explicitly re-granted to anon. Escape hatch: ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions DISABLE; (re-enable immediately after).';

REVOKE EXECUTE ON FUNCTION public.revoke_public_execute_on_new_functions() FROM PUBLIC, anon, authenticated;

DROP EVENT TRIGGER IF EXISTS trg_revoke_public_execute_on_new_functions;
CREATE EVENT TRIGGER trg_revoke_public_execute_on_new_functions
  ON ddl_command_end
  WHEN TAG IN ('CREATE FUNCTION', 'ALTER FUNCTION')
  EXECUTE FUNCTION public.revoke_public_execute_on_new_functions();

ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions ENABLE;

-- Repair current state: the allowlisted functions may already have lost anon EXECUTE to
-- an earlier replace under the narrowed allowlist. Re-grant every overload by name.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND pg_get_function_result(p.oid) <> 'trigger'
      AND p.proname IN (
        'get_org_public_info',
        'login_attempts_rate_ok',
        'get_public_storefront',
        'submit_public_storefront_enquiry',
        'has_role',
        'has_org_role',
        'is_org_admin',
        'is_entry_creator_or_admin',
        'user_belongs_to_org',
        'get_user_organization_ids'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'anon allowlist re-granted on % function(s)', n;
END $$;
