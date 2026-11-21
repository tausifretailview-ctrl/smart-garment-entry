-- SECURITY (Lovable scan, 21 Nov 2026): "Some database functions run commands they build as
-- the owner". Two SECURITY DEFINER functions build their SQL from a table name the caller
-- passes, and the scan found them callable by logged-in users:
--
--   1. delete_child_rows_for_org(text, text, text, uuid)
--      Deletes rows of ANY table that points at a parent with organization_id, with the
--      owner's rights (Row Level Security does not apply). It is a helper for the
--      reset-organization edge function only. A logged-in user who could call it could delete
--      data they have no right to. Now:
--        * the function itself refuses every caller except the service role / SQL editor;
--        * the table and column names must be real tables of this app (public schema, parent
--          with id + organization_id, child with that column);
--        * EXECUTE is taken away from PUBLIC, anon and authenticated (service_role only).
--
--   2. _assert_row_org_access(regclass, uuid)
--      The shop check other functions call ("does the logged-in user belong to the shop this
--      record is in?"). It only answers pass / error, never returns data, and its table
--      argument is a regclass (an existing table, safely quoted), so it cannot be made to run
--      other SQL. Now:
--        * it only accepts tables of this app that have id + organization_id;
--        * EXECUTE is taken away from logged-in users too, IF nothing needs it: the functions
--          that call it are SECURITY DEFINER (they run as their owner, who keeps the right).
--          If any ordinary function or RLS policy calls it, the right is kept and the notice
--          names them, so nothing breaks.
--
-- Same signatures. Safe to run more than once. One transaction: any error changes nothing.
-- The last statement lists who can call the two functions afterwards.
-- UNDO: re-run supabase/migrations/20261231120100_security_org_guards_on_definer_functions.sql
--       (restores _assert_row_org_access) and 20260210175125 + 20260903064327 (the delete helper).

BEGIN;

CREATE OR REPLACE FUNCTION public.delete_child_rows_for_org(
  p_child_table text,
  p_fk_column text,
  p_parent_table text,
  p_organization_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );
  v_child regclass;
  v_parent regclass;
  v_count bigint;
BEGIN
  -- Only the reset-organization edge function (service role) or the SQL editor (no API role).
  IF v_role IS NOT NULL AND v_role <> 'service_role' THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Organization is required' USING ERRCODE = '22004';
  END IF;
  PERFORM public._assert_org_access(p_organization_id);

  -- The names must be real tables of this app, not anything a caller types.
  SELECT c.oid::regclass INTO v_parent
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = p_parent_table
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped);
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Unknown parent table %', p_parent_table USING ERRCODE = '42P01';
  END IF;

  SELECT c.oid::regclass INTO v_child
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname = p_child_table
    AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = p_fk_column AND NOT a.attisdropped);
  IF v_child IS NULL THEN
    RAISE EXCEPTION 'Unknown child table or column %.%', p_child_table, p_fk_column USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'WITH deleted AS (
       DELETE FROM %s
       WHERE %I IN (SELECT id FROM %s WHERE organization_id = $1)
       RETURNING 1
     ) SELECT count(*) FROM deleted',
    v_child, p_fk_column, v_parent
  ) INTO v_count USING p_organization_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._assert_row_org_access(p_table regclass, p_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF p_id IS NULL THEN
    RETURN;
  END IF;
  -- Only this app's own tables that carry a shop: public schema, with id and organization_id.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.oid = p_table AND n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'organization_id' AND NOT a.attisdropped)
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'id' AND NOT a.attisdropped)
  ) THEN
    RAISE EXCEPTION 'Not a shop table' USING ERRCODE = '42501';
  END IF;
  EXECUTE format('SELECT organization_id FROM %s WHERE id = $1', p_table) INTO v_org USING p_id;
  IF v_org IS NULL THEN
    -- row not found: leave "not found" to the function, but never to an anonymous caller
    IF auth.uid() IS NULL
       AND COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''),
                    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role') = 'anon' THEN
      RAISE EXCEPTION 'Login required' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  PERFORM public._assert_org_access(v_org);
END;
$$;

REVOKE ALL ON FUNCTION public._assert_row_org_access(regclass, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._assert_row_org_access(regclass, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._assert_row_org_access(regclass, uuid) TO service_role;

-- Take the right away from logged-in users only when nothing that runs as the user needs it.
DO $lock$
DECLARE
  v_needed_by text;
BEGIN
  SELECT string_agg(who, ', ') INTO v_needed_by
  FROM (
    -- ordinary (not SECURITY DEFINER) functions run as the caller
    SELECT p.oid::regprocedure::text AS who
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
      AND NOT p.prosecdef
      AND p.prosrc ~* '_assert_row_org_access'
    UNION ALL
    -- RLS policies run as the caller
    SELECT format('policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename)
    FROM pg_policies pol
    WHERE COALESCE(pol.qual, '') ~* '_assert_row_org_access'
       OR COALESCE(pol.with_check, '') ~* '_assert_row_org_access'
    UNION ALL
    -- views run as the caller when they are security_invoker
    SELECT format('view %I.%I', v.schemaname, v.viewname)
    FROM pg_views v
    WHERE v.schemaname NOT IN ('pg_catalog', 'information_schema')
      AND v.definition ~* '_assert_row_org_access'
  ) callers;

  IF v_needed_by IS NULL THEN
    REVOKE ALL ON FUNCTION public._assert_row_org_access(regclass, uuid) FROM authenticated;
    RAISE NOTICE '_assert_row_org_access: logged-in users can no longer call it directly.';
  ELSE
    GRANT EXECUTE ON FUNCTION public._assert_row_org_access(regclass, uuid) TO authenticated;
    RAISE NOTICE '_assert_row_org_access: kept callable by logged-in users, needed by: %', v_needed_by;
  END IF;
END
$lock$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Who can call the two functions now (expected: delete helper = service_role only).
SELECT p.oid::regprocedure AS function_name,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_call,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS logged_in_can_call,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_call
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('delete_child_rows_for_org', '_assert_row_org_access')
ORDER BY 1;
